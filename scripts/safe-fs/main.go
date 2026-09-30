package main

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"unicode"
)

const (
	maxRequestBytes = 1 << 20
	maxFieldBytes   = 32 << 10
	maxTreeEntries  = 200_000
	maxTreeDepth    = 512
	recoveryDirName = ".go-beast-recovery"
)

type request struct {
	Operation      string         `json:"operation"`
	Root           string         `json:"root"`
	Path           string         `json:"path"`
	Source         string         `json:"source,omitempty"`
	ExpectedSHA256 string         `json:"expected_sha256,omitempty"`
	BackupPath     string         `json:"backup_path,omitempty"`
	Snapshot       *snapshot      `json:"snapshot,omitempty"`
	ExpectedState  *expectedState `json:"expected_state,omitempty"`
}

type snapshot struct {
	State  string `json:"state"`
	Mode   uint32 `json:"mode,omitempty"`
	Link   string `json:"link,omitempty"`
	Backup string `json:"backup,omitempty"`
}

type expectedState struct {
	State  string  `json:"state"`
	Mode   *uint32 `json:"mode,omitempty"`
	SHA256 string  `json:"sha256,omitempty"`
}

type response struct {
	Status        string    `json:"status,omitempty"`
	State         string    `json:"state,omitempty"`
	Mode          *uint32   `json:"mode,omitempty"`
	SHA256        string    `json:"sha256,omitempty"`
	Snapshot      *snapshot `json:"snapshot,omitempty"`
	RecoveryPath  string    `json:"recovery_path,omitempty"`
	RecoveryPaths []string  `json:"recovery_paths,omitempty"`
	Error         string    `json:"error,omitempty"`
}

func responseWithRecovery(status string, recoveryPaths ...string) response {
	paths := make([]string, 0, len(recoveryPaths))
	seen := make(map[string]struct{}, len(recoveryPaths))
	for _, recoveryPath := range recoveryPaths {
		if recoveryPath == "" {
			continue
		}
		if _, ok := seen[recoveryPath]; ok {
			continue
		}
		seen[recoveryPath] = struct{}{}
		paths = append(paths, recoveryPath)
	}
	result := response{Status: status, RecoveryPaths: paths}
	if len(paths) > 0 {
		result.RecoveryPath = paths[0]
	}
	return result
}

func failedResponse(err error, recoveryPaths ...string) response {
	result := responseWithRecovery("failed", recoveryPaths...)
	if err != nil {
		result.Error = err.Error()
	}
	return result
}

type fingerprint struct {
	State   string
	Mode    uint32
	HasMode bool
	SHA256  string
}

type testHooks struct {
	afterParentsOpened func()
	afterFingerprint   func(operation, target string)
	afterSnapshotCopy  func(target string)
	beforeRename       func(operation, target string)
	beforeRecoveryMove func(target, recoveryPath string)
}

func validateMoveNames(sourceName, destinationDirectoryName, destinationName string) error {
	for _, name := range []string{sourceName, destinationDirectoryName, destinationName} {
		if name == "" || name == "." || name == ".." || strings.ContainsAny(name, `/\\`) || strings.IndexByte(name, 0) >= 0 {
			return fmt.Errorf("invalid single-component rename name %q", name)
		}
	}
	return nil
}

type digestEntry struct {
	name string
	line string
}

type copyContext struct {
	directories map[string]os.FileInfo
	entries     int
}

func main() {
	payload, err := io.ReadAll(io.LimitReader(os.Stdin, maxRequestBytes+1))
	if err != nil {
		fail(err)
	}
	if len(payload) == 0 || len(payload) > maxRequestBytes {
		fail(fmt.Errorf("request must contain between 1 and %d bytes", maxRequestBytes))
	}
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	var req request
	if err := decoder.Decode(&req); err != nil {
		fail(fmt.Errorf("invalid request JSON: %w", err))
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		if err == nil {
			fail(errors.New("request must contain one JSON value"))
		}
		fail(fmt.Errorf("invalid trailing request data: %w", err))
	}
	result, err := runRequest(req, nil)
	if err != nil {
		fail(err)
	}
	if err := json.NewEncoder(os.Stdout).Encode(result); err != nil {
		fail(fmt.Errorf("encode response: %w", err))
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func runRequest(req request, hooks *testHooks) (response, error) {
	if err := validateRequest(req); err != nil {
		return response{}, err
	}
	target, err := validateRelativeTarget(req.Path, req.Operation)
	if err != nil {
		return response{}, err
	}
	createRoot := req.Operation == "install" || (req.Operation == "restore" && req.Snapshot.State != "absent" && (req.ExpectedState == nil || req.ExpectedState.State == "absent"))
	if createRoot {
		if err := os.MkdirAll(req.Root, 0o755); err != nil {
			return response{}, fmt.Errorf("create Hermes root: %w", err)
		}
	}
	root, err := os.OpenRoot(req.Root)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return responseForMissingRoot(req), nil
		}
		return response{}, fmt.Errorf("open Hermes root: %w", err)
	}
	defer root.Close()
	rootInfo, err := root.Stat(".")
	if err != nil {
		return response{}, fmt.Errorf("stat Hermes root: %w", err)
	}
	if !rootInfo.IsDir() {
		return response{}, errors.New("Hermes root is not a directory")
	}

	switch req.Operation {
	case "inspect", "fingerprint":
		openedParent, targetName, missing, openErr := openParent(root, target, false)
		if openErr != nil {
			return response{}, openErr
		}
		if missing {
			return response{State: "absent"}, nil
		}
		if openedParent != root {
			defer openedParent.Close()
		}
		if hooks != nil && hooks.afterParentsOpened != nil {
			hooks.afterParentsOpened()
		}
		var fp fingerprint
		if req.Operation == "inspect" {
			fp, err = ownershipDigestAt(openedParent, targetName)
		} else {
			fp, err = fingerprintAt(openedParent, targetName)
		}
		if err != nil {
			return response{}, err
		}
		return responseForFingerprint(fp), nil
	case "snapshot":
		return snapshotRequest(root, target, req, hooks)
	case "install":
		return installRequest(root, target, req, hooks)
	case "remove":
		return removeRequest(root, target, req, hooks)
	case "restore":
		return restoreRequest(root, target, req, hooks)
	default:
		return response{}, fmt.Errorf("unsupported operation %q", req.Operation)
	}
}

func responseForMissingRoot(req request) response {
	switch req.Operation {
	case "inspect", "fingerprint":
		return response{State: "absent"}
	case "snapshot":
		return response{Snapshot: &snapshot{State: "absent"}}
	case "remove":
		return response{Status: "removed"}
	case "restore":
		if req.Snapshot != nil && req.Snapshot.State == "absent" {
			return response{Status: "restored"}
		}
		return response{Status: "preserved"}
	default:
		return response{}
	}
}

func validateRequest(req request) error {
	if req.Operation != "inspect" && req.Operation != "fingerprint" && req.Operation != "install" && req.Operation != "remove" && req.Operation != "snapshot" && req.Operation != "restore" {
		return fmt.Errorf("unsupported operation %q", req.Operation)
	}
	if req.Root == "" || len(req.Root) > maxFieldBytes || !filepath.IsAbs(req.Root) || filepath.Clean(req.Root) != req.Root || strings.IndexByte(req.Root, 0) >= 0 {
		return errors.New("root must be a clean absolute path")
	}
	for label, value := range map[string]string{"path": req.Path, "source": req.Source, "backup_path": req.BackupPath} {
		if len(value) > maxFieldBytes || strings.IndexByte(value, 0) >= 0 {
			return fmt.Errorf("%s exceeds the allowed size or contains NUL", label)
		}
	}
	if len(req.ExpectedSHA256) > 64 {
		return errors.New("expected_sha256 is too long")
	}
	if req.ExpectedSHA256 != "" {
		decoded, err := hex.DecodeString(req.ExpectedSHA256)
		if err != nil || len(decoded) != sha256.Size || strings.ToLower(req.ExpectedSHA256) != req.ExpectedSHA256 {
			return errors.New("expected_sha256 must be a lowercase SHA-256 hex digest")
		}
	}
	if req.Operation == "install" && req.Source == "" {
		return errors.New("install requires source")
	}
	if req.Operation == "restore" && req.Snapshot == nil {
		return errors.New("restore requires snapshot")
	}
	if req.Source != "" && (!filepath.IsAbs(req.Source) || filepath.Clean(req.Source) != req.Source) {
		return errors.New("source must be a clean absolute path")
	}
	if req.BackupPath != "" && (!filepath.IsAbs(req.BackupPath) || filepath.Clean(req.BackupPath) != req.BackupPath) {
		return errors.New("backup_path must be a clean absolute path")
	}
	if req.ExpectedState != nil {
		if !validState(req.ExpectedState.State) {
			return fmt.Errorf("invalid expected_state state %q", req.ExpectedState.State)
		}
		if req.ExpectedState.SHA256 != "" {
			decoded, err := hex.DecodeString(req.ExpectedState.SHA256)
			if err != nil || len(decoded) != sha256.Size || strings.ToLower(req.ExpectedState.SHA256) != req.ExpectedState.SHA256 {
				return errors.New("expected_state.sha256 must be a lowercase SHA-256 hex digest")
			}
		}
	}
	if req.Snapshot != nil {
		if !validState(req.Snapshot.State) {
			return fmt.Errorf("invalid snapshot state %q", req.Snapshot.State)
		}
		if req.Snapshot.State == "symlink" && req.Snapshot.Link == "" {
			return errors.New("symlink snapshot requires link")
		}
		if req.Snapshot.State == "file" || req.Snapshot.State == "directory" {
			if !validBackupEntry(req.Snapshot.Backup) {
				return errors.New("file and directory snapshots require a basename backup entry")
			}
		}
	}
	return nil
}

func validState(state string) bool {
	return state == "absent" || state == "file" || state == "directory" || state == "symlink" || state == "other"
}

func validBackupEntry(value string) bool {
	return value != "" && value != "." && value != ".." && !strings.ContainsAny(value, "/\\\x00") && validPortableComponent(value)
}

func validateRelativeTarget(value, operation string) (string, error) {
	if value == "" || len(value) > maxFieldBytes || strings.IndexByte(value, 0) >= 0 || strings.Contains(value, "\\") {
		return "", errors.New("path must be a non-empty Hermes-root-relative slash path")
	}
	if path.IsAbs(value) || strings.HasPrefix(value, "//") {
		return "", errors.New("path must not be absolute")
	}
	clean := path.Clean(value)
	if clean == "." {
		if value == "." && (operation == "inspect" || operation == "fingerprint") {
			return clean, nil
		}
		return "", errors.New("path must not refer to the Hermes root")
	}
	if clean != value || clean == ".." || strings.HasPrefix(clean, "../") {
		return "", errors.New("path must be canonical and must not contain dot-dot components")
	}
	for _, component := range strings.Split(clean, "/") {
		if component == "" || component == "." || component == ".." {
			return "", errors.New("path contains an invalid component")
		}
		if !validPortableComponent(component) {
			return "", fmt.Errorf("path contains a non-portable component %q", component)
		}
	}
	return clean, nil
}

func validPortableComponent(value string) bool {
	if strings.ContainsAny(value, `<>:"|?*`) || strings.HasSuffix(value, ".") || strings.HasSuffix(value, " ") {
		return false
	}
	deviceName := strings.ToUpper(strings.SplitN(value, ".", 2)[0])
	switch deviceName {
	case "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$":
		return false
	}
	if len(deviceName) == 4 && (strings.HasPrefix(deviceName, "COM") || strings.HasPrefix(deviceName, "LPT")) {
		digit := deviceName[3]
		if digit >= '1' && digit <= '9' {
			return false
		}
	}
	return true
}

func responseForFingerprint(fp fingerprint) response {
	result := response{State: fp.State, SHA256: fp.SHA256}
	if fp.HasMode {
		mode := fp.Mode
		result.Mode = &mode
	}
	return result
}

func openParent(root *os.Root, relative string, createMissing bool) (*os.Root, string, bool, error) {
	if relative == "." {
		return root, ".", false, nil
	}
	components := strings.Split(relative, "/")
	parentComponents := components[:len(components)-1]
	current := root
	owned := false
	prefix := ""
	for _, component := range parentComponents {
		if prefix == "" {
			prefix = component
		} else {
			prefix += "/" + component
		}
		pathInfo, pathErr := root.Lstat(prefix)
		handleInfo, handleErr := current.Lstat(component)
		if errors.Is(pathErr, os.ErrNotExist) || errors.Is(handleErr, os.ErrNotExist) {
			if !createMissing {
				if owned {
					_ = current.Close()
				}
				return nil, "", true, nil
			}
			if pathErr == nil || handleErr == nil {
				if owned {
					_ = current.Close()
				}
				return nil, "", false, fmt.Errorf("parent component changed while opening %q", prefix)
			}
			if mkdirErr := root.Mkdir(prefix, 0o755); mkdirErr != nil && !errors.Is(mkdirErr, os.ErrExist) {
				if owned {
					_ = current.Close()
				}
				return nil, "", false, fmt.Errorf("create target parent %q: %w", prefix, mkdirErr)
			}
			pathInfo, pathErr = root.Lstat(prefix)
			handleInfo, handleErr = current.Lstat(component)
		}
		if pathErr != nil || handleErr != nil {
			if owned {
				_ = current.Close()
			}
			if pathErr != nil {
				return nil, "", false, fmt.Errorf("inspect target parent %q: %w", prefix, pathErr)
			}
			return nil, "", false, fmt.Errorf("inspect opened target parent %q: %w", prefix, handleErr)
		}
		if pathInfo.Mode()&os.ModeSymlink != 0 || handleInfo.Mode()&os.ModeSymlink != 0 {
			if owned {
				_ = current.Close()
			}
			return nil, "", false, fmt.Errorf("refusing symlinked Hermes descendant %q", prefix)
		}
		if !pathInfo.IsDir() || !handleInfo.IsDir() {
			if owned {
				_ = current.Close()
			}
			return nil, "", false, fmt.Errorf("Hermes descendant %q is not a directory", prefix)
		}
		if !os.SameFile(pathInfo, handleInfo) {
			if owned {
				_ = current.Close()
			}
			return nil, "", false, fmt.Errorf("Hermes descendant %q changed while opening", prefix)
		}
		child, openErr := current.OpenRoot(component)
		if openErr != nil {
			if owned {
				_ = current.Close()
			}
			return nil, "", false, fmt.Errorf("open Hermes descendant %q: %w", prefix, openErr)
		}
		childInfo, statErr := child.Stat(".")
		if statErr != nil || !os.SameFile(pathInfo, childInfo) {
			_ = child.Close()
			if owned {
				_ = current.Close()
			}
			if statErr != nil {
				return nil, "", false, fmt.Errorf("stat opened Hermes descendant %q: %w", prefix, statErr)
			}
			return nil, "", false, fmt.Errorf("Hermes descendant %q changed while opening", prefix)
		}
		if owned {
			_ = current.Close()
		}
		current = child
		owned = true
	}
	if !owned {
		duplicate, err := root.OpenRoot(".")
		if err != nil {
			return nil, "", false, fmt.Errorf("duplicate Hermes root handle: %w", err)
		}
		current = duplicate
	}
	return current, components[len(components)-1], false, nil
}

func verifyParent(root *os.Root, relative string, openedParent *os.Root) error {
	if relative == "." {
		return errors.New("refusing to mutate the Hermes root")
	}
	fresh, _, missing, err := openParent(root, relative, false)
	if err != nil {
		return err
	}
	if missing {
		return fmt.Errorf("target parent for %q disappeared", relative)
	}
	defer fresh.Close()
	openedInfo, err := openedParent.Stat(".")
	if err != nil {
		return fmt.Errorf("stat opened target parent: %w", err)
	}
	freshInfo, err := fresh.Stat(".")
	if err != nil {
		return fmt.Errorf("stat current target parent: %w", err)
	}
	if !os.SameFile(openedInfo, freshInfo) {
		return fmt.Errorf("target parent for %q changed", relative)
	}
	return nil
}

func lstatRelative(root *os.Root, relative string) (os.FileInfo, error) {
	if relative == "." {
		return root.Lstat(".")
	}
	parent, base, missing, err := openParent(root, relative, false)
	if err != nil {
		return nil, err
	}
	if missing {
		return nil, os.ErrNotExist
	}
	defer parent.Close()
	parentInfo, parentErr := parent.Lstat(base)
	rootInfo, rootErr := root.Lstat(relative)
	if parentErr != nil {
		return nil, parentErr
	}
	if rootErr != nil {
		return nil, rootErr
	}
	if !os.SameFile(parentInfo, rootInfo) {
		return nil, fmt.Errorf("target %q changed while inspecting", relative)
	}
	return rootInfo, nil
}

func openDirectoryFile(root *os.Root, relative string, expected os.FileInfo) (*os.File, error) {
	if !expected.IsDir() || expected.Mode()&os.ModeSymlink != 0 {
		return nil, fmt.Errorf("%q is not a non-symlink directory", relative)
	}
	if relative == "." {
		file, err := root.Open(".")
		if err != nil {
			return nil, err
		}
		actual, statErr := file.Stat()
		if statErr != nil || !os.SameFile(expected, actual) {
			_ = file.Close()
			if statErr != nil {
				return nil, statErr
			}
			return nil, fmt.Errorf("directory %q changed while opening", relative)
		}
		return file, nil
	}
	current, err := lstatRelative(root, relative)
	if err != nil {
		return nil, err
	}
	if current.Mode()&os.ModeSymlink != 0 || !os.SameFile(expected, current) {
		return nil, fmt.Errorf("directory %q changed while opening", relative)
	}
	file, err := root.Open(relative)
	if err != nil {
		return nil, err
	}
	actual, statErr := file.Stat()
	if statErr != nil || !os.SameFile(expected, actual) {
		_ = file.Close()
		if statErr != nil {
			return nil, statErr
		}
		return nil, fmt.Errorf("directory %q changed while opening", relative)
	}
	return file, nil
}

func fingerprintAt(root *os.Root, relative string) (fingerprint, error) {
	info, err := lstatRelative(root, relative)
	if errors.Is(err, os.ErrNotExist) {
		return fingerprint{State: "absent"}, nil
	}
	if err != nil {
		return fingerprint{}, fmt.Errorf("inspect target %q: %w", relative, err)
	}
	fp := fingerprint{Mode: modeNumber(info.Mode()), HasMode: true}
	switch {
	case info.Mode()&os.ModeSymlink != 0:
		fp.State = "symlink"
	case info.IsDir():
		fp.State = "directory"
	case info.Mode().IsRegular():
		fp.State = "file"
	default:
		fp.State = "other"
	}
	h := sha256.New()
	if err := appendTargetFingerprint(root, relative, ".", info, 0, h); err != nil {
		return fingerprint{}, err
	}
	fp.SHA256 = hex.EncodeToString(h.Sum(nil))
	return fp, nil
}

func appendTargetFingerprint(root *os.Root, relative, name string, info os.FileInfo, depth int, digest io.Writer) error {
	if depth > maxTreeDepth {
		return fmt.Errorf("fingerprint tree exceeds maximum depth %d", maxTreeDepth)
	}
	mode := strconv.FormatUint(uint64(modeNumber(info.Mode())), 8)
	switch {
	case info.Mode()&os.ModeSymlink != 0:
		link, err := root.Readlink(relative)
		if err != nil {
			return fmt.Errorf("read symlink %q: %w", relative, err)
		}
		after, err := lstatRelative(root, relative)
		if err != nil || !os.SameFile(info, after) {
			if err != nil {
				return err
			}
			return fmt.Errorf("symlink %q changed while fingerprinting", relative)
		}
		_, err = io.WriteString(digest, name+"\x00symlink\x00"+mode+"\x00"+link+"\n")
		return err
	case info.IsDir():
		if _, err := io.WriteString(digest, name+"\x00directory\x00"+mode+"\n"); err != nil {
			return err
		}
		directory, err := openDirectoryFile(root, relative, info)
		if err != nil {
			return fmt.Errorf("open directory %q: %w", relative, err)
		}
		children, readErr := directory.ReadDir(-1)
		closeErr := directory.Close()
		if readErr != nil {
			return fmt.Errorf("list directory %q: %w", relative, readErr)
		}
		if closeErr != nil {
			return closeErr
		}
		sort.Slice(children, func(i, j int) bool { return nodeLocaleLess(children[i].Name(), children[j].Name()) })
		count := 0
		for _, child := range children {
			childName := child.Name()
			if childName == "." || childName == ".." || strings.ContainsAny(childName, "/\\\x00") {
				return fmt.Errorf("unsupported entry name in %q", relative)
			}
			count++
			if count > maxTreeEntries {
				return fmt.Errorf("fingerprint directory exceeds maximum of %d entries", maxTreeEntries)
			}
			childRelative := path.Join(relative, childName)
			if relative == "." {
				childRelative = childName
			}
			childInfo, err := lstatRelative(root, childRelative)
			if err != nil {
				return fmt.Errorf("inspect %q: %w", childRelative, err)
			}
			if err := appendTargetFingerprint(root, childRelative, path.Join(name, childName), childInfo, depth+1, digest); err != nil {
				return err
			}
		}
		return nil
	case info.Mode().IsRegular():
		if _, err := io.WriteString(digest, name+"\x00file\x00"+mode+"\x00"); err != nil {
			return err
		}
		file, err := root.OpenFile(relative, os.O_RDONLY, 0)
		if err != nil {
			return fmt.Errorf("open file %q: %w", relative, err)
		}
		actual, statErr := file.Stat()
		if statErr != nil || !actual.Mode().IsRegular() || !os.SameFile(info, actual) {
			_ = file.Close()
			if statErr != nil {
				return statErr
			}
			return fmt.Errorf("file %q changed while fingerprinting", relative)
		}
		_, copyErr := io.Copy(digest, file)
		closeErr := file.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		_, err = io.WriteString(digest, "\n")
		return err
	default:
		_, err := io.WriteString(digest, name+"\x00other\x00"+mode+"\n")
		return err
	}
}

func ownershipDigestAt(root *os.Root, relative string) (fingerprint, error) {
	info, err := lstatRelative(root, relative)
	if errors.Is(err, os.ErrNotExist) {
		return fingerprint{State: "absent"}, nil
	}
	if err != nil {
		return fingerprint{}, fmt.Errorf("inspect target %q: %w", relative, err)
	}
	fp := fingerprint{Mode: modeNumber(info.Mode()), HasMode: true}
	switch {
	case info.Mode()&os.ModeSymlink != 0:
		link, linkErr := root.Readlink(relative)
		if linkErr != nil {
			return fingerprint{}, fmt.Errorf("read symlink %q: %w", relative, linkErr)
		}
		fp.State = "symlink"
		fp.SHA256 = hashString("symlink:" + link)
	case info.IsDir():
		fp.State = "directory"
		fp.SHA256, err = digestDirectory(root, relative, info)
	case info.Mode().IsRegular():
		fp.State = "file"
		fp.SHA256, err = digestFile(root, relative, info)
	default:
		return fingerprint{}, fmt.Errorf("unsupported ownership source type at %q", relative)
	}
	if err != nil {
		return fingerprint{}, err
	}
	return fp, nil
}

func digestFile(root *os.Root, relative string, expected os.FileInfo) (string, error) {
	file, err := root.OpenFile(relative, os.O_RDONLY, 0)
	if err != nil {
		return "", fmt.Errorf("open file %q: %w", relative, err)
	}
	defer file.Close()
	actual, err := file.Stat()
	if err != nil {
		return "", err
	}
	if !actual.Mode().IsRegular() || !os.SameFile(expected, actual) {
		return "", fmt.Errorf("file %q changed while opening", relative)
	}
	h := sha256.New()
	if _, err := io.Copy(h, file); err != nil {
		return "", fmt.Errorf("read file %q: %w", relative, err)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func digestDirectory(root *os.Root, relative string, expected os.FileInfo) (string, error) {
	entries := make([]digestEntry, 0)
	count := 0
	if err := collectDigestEntries(root, relative, "", expected, 0, &count, &entries); err != nil {
		return "", err
	}
	h := sha256.New()
	for _, entry := range entries {
		_, _ = io.WriteString(h, entry.line)
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func collectDigestEntries(root *os.Root, relative, prefix string, expected os.FileInfo, depth int, count *int, entries *[]digestEntry) error {
	if depth > maxTreeDepth {
		return fmt.Errorf("directory tree exceeds maximum depth %d", maxTreeDepth)
	}
	directory, err := openDirectoryFile(root, relative, expected)
	if err != nil {
		return fmt.Errorf("open directory %q: %w", relative, err)
	}
	children, err := directory.ReadDir(-1)
	closeErr := directory.Close()
	if err != nil {
		return fmt.Errorf("list directory %q: %w", relative, err)
	}
	if closeErr != nil {
		return closeErr
	}
	sort.Slice(children, func(i, j int) bool { return nodeLocaleLess(children[i].Name(), children[j].Name()) })
	for _, child := range children {
		name := child.Name()
		if name == "." || name == ".." || strings.ContainsAny(name, "/\\\x00") {
			return fmt.Errorf("unsupported entry name in %q", relative)
		}
		*count++
		if *count > maxTreeEntries {
			return fmt.Errorf("directory tree exceeds maximum of %d entries", maxTreeEntries)
		}
		childRelative := path.Join(relative, name)
		if relative == "." {
			childRelative = name
		}
		childPrefix := path.Join(prefix, name)
		info, statErr := lstatRelative(root, childRelative)
		if statErr != nil {
			return fmt.Errorf("inspect %q: %w", childRelative, statErr)
		}
		if info.Mode()&os.ModeSymlink != 0 {
			link, linkErr := root.Readlink(childRelative)
			if linkErr != nil {
				return fmt.Errorf("read symlink %q: %w", childRelative, linkErr)
			}
			after, afterErr := lstatRelative(root, childRelative)
			if afterErr != nil || !os.SameFile(info, after) {
				if afterErr != nil {
					return afterErr
				}
				return fmt.Errorf("symlink %q changed while fingerprinting", childRelative)
			}
			linkDigest := hashString("symlink:" + link)
			*entries = append(*entries, digestEntry{name: childPrefix, line: childPrefix + "\x00symlink\x00" + linkDigest + "\n"})
			continue
		}
		if info.IsDir() {
			if err := collectDigestEntries(root, childRelative, childPrefix, info, depth+1, count, entries); err != nil {
				return err
			}
			continue
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("unsupported tree entry type at %q", childRelative)
		}
		fileDigest, fileErr := digestFile(root, childRelative, info)
		if fileErr != nil {
			return fileErr
		}
		*entries = append(*entries, digestEntry{name: childPrefix, line: childPrefix + "\x00file\x00" + fileDigest + "\n"})
	}
	return nil
}

func snapshotRequest(root *os.Root, target string, req request, hooks *testHooks) (response, error) {
	parent, targetName, missing, err := openParent(root, target, false)
	if err != nil {
		return response{}, err
	}
	if missing {
		return response{Snapshot: &snapshot{State: "absent"}}, nil
	}
	defer parent.Close()
	if hooks != nil && hooks.afterParentsOpened != nil {
		hooks.afterParentsOpened()
	}
	before, err := fingerprintAt(parent, targetName)
	if err != nil {
		return response{}, err
	}
	metadata := snapshot{State: before.State, Mode: before.Mode}
	switch before.State {
	case "absent":
		return response{Snapshot: &snapshot{State: "absent"}}, nil
	case "symlink":
		link, readErr := parent.Readlink(targetName)
		if readErr != nil {
			return response{}, fmt.Errorf("read snapshot symlink: %w", readErr)
		}
		after, afterErr := fingerprintAt(parent, targetName)
		if afterErr != nil || !sameFingerprint(before, after) {
			if afterErr != nil {
				return response{}, afterErr
			}
			return response{}, errors.New("snapshot source changed while it was being read")
		}
		metadata.Link = link
		return response{Snapshot: &metadata}, nil
	case "file", "directory":
		backupRoot, backupName, openErr := openBackupDestination(req.BackupPath)
		if openErr != nil {
			return response{}, openErr
		}
		defer backupRoot.Close()
		context := newCopyContext()
		backupRel := backupName
		created, copyErr := copyNode(parent, targetName, backupRoot, backupRel, 0, context)
		if copyErr != nil {
			return response{}, fmt.Errorf("copy snapshot to backup: %w (created=%t)", copyErr, created)
		}
		metadata.Backup = backupName
		after, fpErr := fingerprintAt(parent, targetName)
		if fpErr != nil {
			return response{}, fpErr
		}
		if !sameFingerprint(before, after) {
			return response{}, errors.New("snapshot source changed while it was being copied")
		}
		return response{Snapshot: &metadata}, nil
	default:
		return response{}, fmt.Errorf("unsupported snapshot state %q", before.State)
	}
}

func installRequest(root *os.Root, target string, req request, hooks *testHooks) (response, error) {
	source, err := openCanonicalSource(req.Source)
	if err != nil {
		return response{}, err
	}
	defer source.Close()
	sourceInfo, err := source.Stat(".")
	if err != nil || !sourceInfo.IsDir() {
		if err != nil {
			return response{}, fmt.Errorf("stat install source: %w", err)
		}
		return response{}, errors.New("install source must be a directory")
	}
	sourceBefore, err := ownershipDigestAt(source, ".")
	if err != nil {
		return response{}, fmt.Errorf("fingerprint install source: %w", err)
	}
	parent, targetName, missing, err := openParent(root, target, true)
	if err != nil {
		return response{}, err
	}
	if missing {
		return response{}, errors.New("failed to create target parent")
	}
	defer parent.Close()
	if hooks != nil && hooks.afterParentsOpened != nil {
		hooks.afterParentsOpened()
	}
	current, err := ownershipDigestAt(parent, targetName)
	if err != nil {
		return response{}, err
	}
	if req.ExpectedSHA256 == "" {
		if current.State != "absent" {
			return response{Status: "preserved", SHA256: current.SHA256}, nil
		}
		if err := verifyParent(root, target, parent); err != nil {
			return response{}, err
		}
		created, copyErr := copyNode(source, ".", parent, targetName, 0, newCopyContext())
		if copyErr != nil {
			recovery, preserveErr := preservePartial(root, target, parent, created)
			if preserveErr != nil {
				return failedResponse(fmt.Errorf("install copy failed: %v; preserve partial copy: %w", copyErr, preserveErr), recovery), nil
			}
			return responseWithRecovery("preserved", recovery), nil
		}
		sourceAfter, sourceErr := ownershipDigestAt(source, ".")
		installed, targetErr := ownershipDigestAt(parent, targetName)
		if sourceErr != nil || targetErr != nil || !sameOwnershipDigest(sourceBefore, sourceAfter) || installed.SHA256 != sourceBefore.SHA256 {
			recovery, preserveErr := preservePartial(root, target, parent, true)
			if preserveErr != nil {
				return failedResponse(fmt.Errorf("installed copy failed verification; preserve copy: %w", preserveErr), recovery), nil
			}
			return responseWithRecovery("preserved", recovery), nil
		}
		return response{Status: "created", SHA256: installed.SHA256}, nil
	}
	if current.State == "absent" || current.SHA256 != req.ExpectedSHA256 {
		return response{Status: "preserved", SHA256: current.SHA256}, nil
	}
	if hooks != nil && hooks.afterFingerprint != nil {
		hooks.afterFingerprint("install", target)
	}
	if hooks != nil && hooks.beforeRename != nil {
		hooks.beforeRename("install", target)
	}
	recovery, err := moveToRecovery(root, target, parent, hooks)
	if err != nil {
		if recovery != "" {
			return failedResponse(err, recovery), nil
		}
		return response{}, err
	}
	quarantined, err := ownershipDigestAt(root, recovery)
	if err != nil {
		return failedResponse(fmt.Errorf("fingerprint moved target %q: %w", recovery, err), recovery), nil
	}
	if quarantined.SHA256 != req.ExpectedSHA256 || quarantined.State != current.State {
		_, copyErr := copyRecoveryBack(root, recovery, target, parent)
		if copyErr != nil {
			return response{Status: "preserved", RecoveryPath: recovery}, nil
		}
		return response{Status: "preserved", RecoveryPath: recovery}, nil
	}
	if err := verifyParent(root, target, parent); err != nil {
		return response{Status: "preserved", RecoveryPath: recovery}, nil
	}
	created, copyErr := copyNode(source, ".", parent, targetName, 0, newCopyContext())
	if copyErr != nil {
		partial, preserveErr := preservePartial(root, target, parent, created)
		if preserveErr != nil {
			return failedResponse(fmt.Errorf("updated copy failed: %v; preserve partial copy: %w", copyErr, preserveErr), recovery, partial), nil
		}
		return responseWithRecovery("preserved", recovery, partial), nil
	}
	sourceAfter, sourceErr := ownershipDigestAt(source, ".")
	installed, targetErr := ownershipDigestAt(parent, targetName)
	if sourceErr != nil || targetErr != nil || !sameOwnershipDigest(sourceBefore, sourceAfter) || installed.SHA256 != sourceBefore.SHA256 {
		partial, preserveErr := preservePartial(root, target, parent, true)
		if preserveErr != nil {
			return failedResponse(fmt.Errorf("updated copy failed verification; preserve partial copy: %w", preserveErr), recovery, partial), nil
		}
		return responseWithRecovery("preserved", recovery, partial), nil
	}
	result := responseWithRecovery("updated", recovery)
	result.SHA256 = installed.SHA256
	return result, nil
}

func removeRequest(root *os.Root, target string, req request, hooks *testHooks) (response, error) {
	parent, targetName, missing, err := openParent(root, target, false)
	if err != nil {
		return response{}, err
	}
	if missing {
		return response{Status: "preserved"}, nil
	}
	defer parent.Close()
	if hooks != nil && hooks.afterParentsOpened != nil {
		hooks.afterParentsOpened()
	}
	current, err := ownershipDigestAt(parent, targetName)
	if err != nil {
		return response{}, err
	}
	if req.ExpectedSHA256 == "" || current.State == "absent" || current.SHA256 != req.ExpectedSHA256 {
		return response{Status: "preserved", SHA256: current.SHA256}, nil
	}
	if hooks != nil && hooks.afterFingerprint != nil {
		hooks.afterFingerprint("remove", target)
	}
	if hooks != nil && hooks.beforeRename != nil {
		hooks.beforeRename("remove", target)
	}
	recovery, err := moveToRecovery(root, target, parent, hooks)
	if err != nil {
		if recovery != "" {
			return failedResponse(err, recovery), nil
		}
		return response{}, err
	}
	quarantined, err := ownershipDigestAt(root, recovery)
	if err != nil {
		return failedResponse(fmt.Errorf("fingerprint moved target %q: %w", recovery, err), recovery), nil
	}
	if quarantined.SHA256 != req.ExpectedSHA256 || quarantined.State != current.State {
		_, _ = copyRecoveryBack(root, recovery, target, parent)
		return responseWithRecovery("preserved", recovery), nil
	}
	return responseWithRecovery("removed", recovery), nil
}

func restoreRequest(root *os.Root, target string, req request, hooks *testHooks) (response, error) {
	parent, targetName, missing, err := openParent(root, target, false)
	if err != nil {
		return response{}, err
	}
	if missing {
		if req.Snapshot.State == "absent" {
			return response{Status: "restored"}, nil
		}
		if req.ExpectedState == nil || req.ExpectedState.State == "absent" {
			return restoreSnapshotToAbsent(root, target, req)
		}
		return response{Status: "preserved"}, nil
	}
	defer parent.Close()
	if hooks != nil && hooks.afterParentsOpened != nil {
		hooks.afterParentsOpened()
	}
	if req.ExpectedState == nil {
		return restoreWithoutFingerprint(root, target, parent, targetName, req, hooks)
	}
	current, err := fingerprintAt(parent, targetName)
	if err != nil {
		return response{}, err
	}
	if !matchesExpectedState(current, req.ExpectedState) {
		return response{Status: "preserved", SHA256: current.SHA256}, nil
	}
	if current.State == "absent" {
		return restoreSnapshotToAbsent(root, target, req)
	}
	if hooks != nil && hooks.afterFingerprint != nil {
		hooks.afterFingerprint("restore", target)
	}
	if hooks != nil && hooks.beforeRename != nil {
		hooks.beforeRename("restore", target)
	}
	recovery, err := moveToRecovery(root, target, parent, hooks)
	if err != nil {
		if recovery != "" {
			return failedResponse(err, recovery), nil
		}
		return response{}, err
	}
	quarantined, err := fingerprintAt(root, recovery)
	if err != nil {
		return failedResponse(fmt.Errorf("fingerprint moved target %q: %w", recovery, err), recovery), nil
	}
	if !matchesExpectedState(quarantined, req.ExpectedState) {
		_, _ = copyRecoveryBack(root, recovery, target, parent)
		result := responseWithRecovery("preserved", recovery)
		result.SHA256 = quarantined.SHA256
		return result, nil
	}
	if req.Snapshot.State == "absent" {
		return responseWithRecovery("restored", recovery), nil
	}
	if err := verifyParent(root, target, parent); err != nil {
		return response{Status: "preserved", RecoveryPath: recovery}, nil
	}
	created, copyErr := copySnapshotToTarget(root, target, parent, targetName, req)
	if copyErr != nil {
		partial, preserveErr := preservePartial(root, target, parent, created)
		if preserveErr != nil {
			return failedResponse(fmt.Errorf("restore snapshot failed: %v; preserve partial restore: %w", copyErr, preserveErr), recovery, partial), nil
		}
		return failedResponse(fmt.Errorf("restore snapshot failed: %w", copyErr), recovery, partial), nil
	}
	if hooks != nil && hooks.afterSnapshotCopy != nil {
		hooks.afterSnapshotCopy(target)
	}
	installed, err := fingerprintAt(root, target)
	if err != nil {
		partial, preserveErr := preservePartial(root, target, parent, created)
		if preserveErr != nil {
			return failedResponse(fmt.Errorf("verify restored snapshot: %v; preserve partial restore: %w", err, preserveErr), recovery, partial), nil
		}
		return failedResponse(fmt.Errorf("verify restored snapshot: %w", err), recovery, partial), nil
	}
	result := responseWithRecovery("restored", recovery)
	result.SHA256 = installed.SHA256
	return result, nil
}

func restoreWithoutFingerprint(root *os.Root, target string, parent *os.Root, targetName string, req request, hooks *testHooks) (response, error) {
	current, err := fingerprintAt(parent, targetName)
	if err != nil {
		return response{}, err
	}
	if current.State == "absent" {
		return restoreSnapshotToAbsent(root, target, req)
	}
	if hooks != nil && hooks.afterFingerprint != nil {
		hooks.afterFingerprint("restore", target)
	}
	if hooks != nil && hooks.beforeRename != nil {
		hooks.beforeRename("restore", target)
	}
	recovery, err := moveToRecovery(root, target, parent, hooks)
	if err != nil {
		if recovery != "" {
			return failedResponse(err, recovery), nil
		}
		return response{}, err
	}
	quarantined, err := fingerprintAt(root, recovery)
	if err != nil {
		return failedResponse(fmt.Errorf("fingerprint moved target %q: %w", recovery, err), recovery), nil
	}
	if !sameFingerprint(current, quarantined) {
		_, _ = copyRecoveryBack(root, recovery, target, parent)
		return response{Status: "preserved", RecoveryPath: recovery}, nil
	}
	if req.Snapshot.State == "absent" {
		return responseWithRecovery("restored", recovery), nil
	}
	if err := verifyParent(root, target, parent); err != nil {
		return response{Status: "preserved", RecoveryPath: recovery}, nil
	}
	created, copyErr := copySnapshotToTarget(root, target, parent, targetName, req)
	if copyErr != nil {
		partial, preserveErr := preservePartial(root, target, parent, created)
		if preserveErr != nil {
			return failedResponse(fmt.Errorf("restore snapshot failed: %v; preserve partial restore: %w", copyErr, preserveErr), recovery, partial), nil
		}
		return failedResponse(fmt.Errorf("restore snapshot failed: %w", copyErr), recovery, partial), nil
	}
	if hooks != nil && hooks.afterSnapshotCopy != nil {
		hooks.afterSnapshotCopy(target)
	}
	installed, err := fingerprintAt(root, target)
	if err != nil {
		partial, preserveErr := preservePartial(root, target, parent, created)
		if preserveErr != nil {
			return failedResponse(fmt.Errorf("verify restored snapshot: %v; preserve partial restore: %w", err, preserveErr), recovery, partial), nil
		}
		return failedResponse(fmt.Errorf("verify restored snapshot: %w", err), recovery, partial), nil
	}
	result := responseWithRecovery("restored", recovery)
	result.SHA256 = installed.SHA256
	return result, nil
}

func restoreSnapshotToAbsent(root *os.Root, target string, req request) (response, error) {
	if req.Snapshot.State == "absent" {
		return response{Status: "restored"}, nil
	}
	parent, targetName, missing, err := openParent(root, target, true)
	if err != nil {
		return failedResponse(fmt.Errorf("open restore target parent: %w", err)), nil
	}
	if missing {
		return failedResponse(errors.New("restore target parent could not be created")), nil
	}
	defer parent.Close()
	if err := verifyParent(root, target, parent); err != nil {
		return failedResponse(fmt.Errorf("verify restore target parent: %w", err)), nil
	}
	created, err := copySnapshotToTarget(root, target, parent, targetName, req)
	if err != nil {
		partial, preserveErr := preservePartial(root, target, parent, created)
		if preserveErr != nil {
			return failedResponse(fmt.Errorf("restore snapshot failed: %v; preserve partial restore: %w", err, preserveErr), partial), nil
		}
		return failedResponse(fmt.Errorf("restore snapshot failed: %w", err), partial), nil
	}
	if !created {
		return failedResponse(errors.New("snapshot restore did not create a target")), nil
	}
	fp, err := fingerprintAt(parent, targetName)
	if err != nil {
		partial, preserveErr := preservePartial(root, target, parent, true)
		if preserveErr != nil {
			return failedResponse(fmt.Errorf("verify restored snapshot: %v; preserve partial restore: %w", err, preserveErr), partial), nil
		}
		return failedResponse(fmt.Errorf("verify restored snapshot: %w", err), partial), nil
	}
	return response{Status: "restored", SHA256: fp.SHA256}, nil
}

func copySnapshotToTarget(root *os.Root, target string, parent *os.Root, targetName string, req request) (bool, error) {
	switch req.Snapshot.State {
	case "absent":
		return false, nil
	case "symlink":
		if err := parent.Symlink(req.Snapshot.Link, targetName); err != nil {
			return false, err
		}
		return true, nil
	case "file", "directory":
		backup, err := os.OpenRoot(req.BackupPath)
		if err != nil {
			return false, fmt.Errorf("open transaction backup directory: %w", err)
		}
		defer backup.Close()
		backupInfo, err := backup.Stat(".")
		if err != nil || !backupInfo.IsDir() {
			if err != nil {
				return false, err
			}
			return false, errors.New("transaction backup source is not a directory")
		}
		return copyNode(backup, req.Snapshot.Backup, parent, targetName, 0, newCopyContext())
	default:
		return false, fmt.Errorf("unsupported snapshot state %q", req.Snapshot.State)
	}
}

func copyRecoveryBack(root *os.Root, recovery, target string, openedParent *os.Root) (bool, error) {
	if err := verifyParent(root, target, openedParent); err != nil {
		return false, err
	}
	recoveryParent, recoveryName, missing, err := openParent(root, recovery, false)
	if err != nil {
		return false, err
	}
	if missing {
		return false, os.ErrNotExist
	}
	defer recoveryParent.Close()
	return copyNode(recoveryParent, recoveryName, openedParent, path.Base(target), 0, newCopyContext())
}

func openCanonicalSource(source string) (*os.Root, error) {
	before, err := os.Lstat(source)
	if err != nil {
		return nil, fmt.Errorf("inspect install source: %w", err)
	}
	if before.Mode()&os.ModeSymlink != 0 || !before.IsDir() {
		return nil, errors.New("install source must be a non-symlink directory")
	}
	resolved, err := filepath.EvalSymlinks(source)
	if err != nil {
		return nil, fmt.Errorf("resolve install source: %w", err)
	}
	root, err := os.OpenRoot(resolved)
	if err != nil {
		return nil, fmt.Errorf("open install source: %w", err)
	}
	after, err := root.Stat(".")
	if err != nil || !os.SameFile(before, after) {
		_ = root.Close()
		if err != nil {
			return nil, fmt.Errorf("stat install source root: %w", err)
		}
		return nil, errors.New("install source changed while opening")
	}
	return root, nil
}

func openBackupDestination(backupPath string) (*os.Root, string, error) {
	if !filepath.IsAbs(backupPath) || filepath.Clean(backupPath) != backupPath {
		return nil, "", errors.New("snapshot backup_path must be a clean absolute destination path")
	}
	name := filepath.Base(backupPath)
	if !validBackupEntry(name) {
		return nil, "", errors.New("snapshot backup_path must name a file entry")
	}
	parentPath := filepath.Dir(backupPath)
	parent, err := os.OpenRoot(parentPath)
	if err != nil {
		return nil, "", fmt.Errorf("open snapshot backup parent: %w", err)
	}
	info, err := parent.Stat(".")
	if err != nil || !info.IsDir() {
		_ = parent.Close()
		if err != nil {
			return nil, "", fmt.Errorf("stat snapshot backup parent: %w", err)
		}
		return nil, "", errors.New("snapshot backup parent is not a directory")
	}
	return parent, name, nil
}

func newCopyContext() *copyContext {
	return &copyContext{directories: make(map[string]os.FileInfo)}
}

func copyNode(sourceRoot *os.Root, sourcePath string, destinationRoot *os.Root, destinationPath string, depth int, context *copyContext) (bool, error) {
	if depth > maxTreeDepth {
		return false, fmt.Errorf("copy tree exceeds maximum depth %d", maxTreeDepth)
	}
	info, err := lstatRelative(sourceRoot, sourcePath)
	if err != nil {
		return false, fmt.Errorf("inspect copy source %q: %w", sourcePath, err)
	}
	if err := verifyDestinationParent(destinationRoot, destinationPath, context); err != nil {
		return false, err
	}
	mode := fileModeFromNumber(modeNumber(info.Mode()))
	switch {
	case info.Mode()&os.ModeSymlink != 0:
		link, err := sourceRoot.Readlink(sourcePath)
		if err != nil {
			return false, err
		}
		after, err := lstatRelative(sourceRoot, sourcePath)
		if err != nil || !os.SameFile(info, after) {
			if err != nil {
				return false, err
			}
			return false, fmt.Errorf("copy source symlink %q changed", sourcePath)
		}
		if err := destinationRoot.Symlink(link, destinationPath); err != nil {
			return false, err
		}
		return true, nil
	case info.IsDir():
		if err := destinationRoot.Mkdir(destinationPath, 0o700); err != nil {
			return false, err
		}
		created := true
		destinationInfo, statErr := lstatRelative(destinationRoot, destinationPath)
		if statErr != nil {
			return created, fmt.Errorf("inspect created destination directory %q: %w", destinationPath, statErr)
		}
		context.directories[destinationPath] = destinationInfo
		sourceDirectory, err := openDirectoryFile(sourceRoot, sourcePath, info)
		if err != nil {
			return created, err
		}
		children, readErr := sourceDirectory.ReadDir(-1)
		closeErr := sourceDirectory.Close()
		if readErr != nil {
			return created, readErr
		}
		if closeErr != nil {
			return created, closeErr
		}
		sort.Slice(children, func(i, j int) bool { return nodeLocaleLess(children[i].Name(), children[j].Name()) })
		for _, child := range children {
			name := child.Name()
			if name == "." || name == ".." || strings.ContainsAny(name, "/\\\x00") {
				return created, fmt.Errorf("unsupported entry name %q", name)
			}
			context.entries++
			if context.entries > maxTreeEntries {
				return created, fmt.Errorf("copy tree exceeds maximum of %d entries", maxTreeEntries)
			}
			childSource := path.Join(sourcePath, name)
			if sourcePath == "." {
				childSource = name
			}
			childDestination := path.Join(destinationPath, name)
			if destinationPath == "." {
				childDestination = name
			}
			_, err := copyNode(sourceRoot, childSource, destinationRoot, childDestination, depth+1, context)
			if err != nil {
				return created, fmt.Errorf("copy entry %q: %w", childSource, err)
			}
		}
		if err := verifyDirectoryIdentity(destinationRoot, destinationPath, context); err != nil {
			return created, err
		}
		if err := destinationRoot.Chmod(destinationPath, mode); err != nil {
			return created, fmt.Errorf("preserve directory mode for %q: %w", destinationPath, err)
		}
		return created, nil
	case info.Mode().IsRegular():
		sourceFile, err := sourceRoot.OpenFile(sourcePath, os.O_RDONLY, 0)
		if err != nil {
			return false, err
		}
		actual, statErr := sourceFile.Stat()
		if statErr != nil || !actual.Mode().IsRegular() || !os.SameFile(info, actual) {
			_ = sourceFile.Close()
			if statErr != nil {
				return false, statErr
			}
			return false, fmt.Errorf("copy source file %q changed while opening", sourcePath)
		}
		destinationFile, err := destinationRoot.OpenFile(destinationPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
		if err != nil {
			_ = sourceFile.Close()
			return false, err
		}
		created := true
		_, copyErr := io.Copy(destinationFile, sourceFile)
		sourceCloseErr := sourceFile.Close()
		if copyErr == nil {
			copyErr = sourceCloseErr
		}
		if copyErr == nil {
			copyErr = destinationFile.Chmod(mode)
		}
		destCloseErr := destinationFile.Close()
		if copyErr == nil {
			copyErr = destCloseErr
		}
		if copyErr != nil {
			return created, fmt.Errorf("copy file %q: %w", sourcePath, copyErr)
		}
		return created, nil
	default:
		return false, fmt.Errorf("unsupported copy source type at %q", sourcePath)
	}
}

func verifyDestinationParent(root *os.Root, relative string, context *copyContext) error {
	parent := path.Dir(relative)
	if parent == "" {
		parent = "."
	}
	if parent == "." {
		return nil
	}
	components := strings.Split(parent, "/")
	prefix := ""
	for _, component := range components {
		if prefix == "" {
			prefix = component
		} else {
			prefix += "/" + component
		}
		info, err := lstatRelative(root, prefix)
		if err != nil {
			return fmt.Errorf("inspect destination parent %q: %w", prefix, err)
		}
		if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
			return fmt.Errorf("destination parent %q is not a non-symlink directory", prefix)
		}
		if prior, ok := context.directories[prefix]; ok {
			if !os.SameFile(prior, info) {
				return fmt.Errorf("destination parent %q changed during copy", prefix)
			}
		} else {
			context.directories[prefix] = info
		}
	}
	return nil
}

func verifyDirectoryIdentity(root *os.Root, relative string, context *copyContext) error {
	info, err := lstatRelative(root, relative)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return fmt.Errorf("destination directory %q changed type", relative)
	}
	prior, ok := context.directories[relative]
	if ok && !os.SameFile(prior, info) {
		return fmt.Errorf("destination directory %q changed during copy", relative)
	}
	context.directories[relative] = info
	return nil
}

func directChildRootName(parent, child *os.Root) (string, error) {
	childInfo, err := child.Stat(".")
	if err != nil {
		return "", err
	}
	directory, err := parent.Open(".")
	if err != nil {
		return "", err
	}
	defer directory.Close()
	entries, err := directory.ReadDir(-1)
	if err != nil {
		return "", err
	}
	for _, entry := range entries {
		info, err := parent.Lstat(entry.Name())
		if err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0 && os.SameFile(childInfo, info) {
			return entry.Name(), nil
		}
	}
	return "", errors.New("opened recovery directory is no longer a direct child of its parent")
}

func recoveryPathForOpenedDirectories(root, recoveryRoot, reserved *os.Root) (string, error) {
	recoveryRootName, err := directChildRootName(root, recoveryRoot)
	if err != nil {
		return "", err
	}
	reservedName, err := directChildRootName(recoveryRoot, reserved)
	if err != nil {
		return "", err
	}
	return path.Join(recoveryRootName, reservedName, "entry"), nil
}

func moveToRecovery(root *os.Root, target string, openedParent *os.Root, hooks *testHooks) (string, error) {
	if err := verifyParent(root, target, openedParent); err != nil {
		return "", err
	}
	targetInfo, err := openedParent.Lstat(path.Base(target))
	if err != nil {
		return "", fmt.Errorf("inspect recovery source %q: %w", target, err)
	}
	recoveryRoot, err := ensureRecoveryDirectory(root)
	if err != nil {
		return "", err
	}
	defer recoveryRoot.Close()
	for attempt := 0; attempt < 8; attempt++ {
		random := make([]byte, 16)
		if _, err := rand.Read(random); err != nil {
			return "", fmt.Errorf("generate recovery name: %w", err)
		}
		name := "recovery-" + hex.EncodeToString(random)
		if err := recoveryRoot.Mkdir(name, 0o700); errors.Is(err, os.ErrExist) {
			continue
		} else if err != nil {
			return "", fmt.Errorf("reserve recovery destination: %w", err)
		}
		recoveryDirectory := recoveryDirName + "/" + name
		recoveryPath := recoveryDirectory + "/entry"
		reserved, err := recoveryRoot.OpenRoot(name)
		if err != nil {
			return "", fmt.Errorf("open reserved recovery directory: %w", err)
		}
		reservedInfo, statErr := reserved.Stat(".")
		if statErr != nil {
			_ = reserved.Close()
			return "", fmt.Errorf("stat reserved recovery directory: %w", statErr)
		}
		if err := verifyParent(root, target, openedParent); err != nil {
			_ = reserved.Close()
			return "", err
		}
		currentRecoveryDirectory, err := lstatRelative(root, recoveryDirectory)
		if err != nil || !currentRecoveryDirectory.IsDir() || currentRecoveryDirectory.Mode()&os.ModeSymlink != 0 || !os.SameFile(reservedInfo, currentRecoveryDirectory) {
			_ = reserved.Close()
			if err != nil {
				return "", fmt.Errorf("verify reserved recovery directory: %w", err)
			}
			return "", errors.New("reserved recovery directory changed before move")
		}
		if hooks != nil && hooks.beforeRecoveryMove != nil {
			hooks.beforeRecoveryMove(target, recoveryPath)
		}
		if err := renameNoReplace(openedParent, path.Base(target), recoveryRoot, name, "entry", reservedInfo); err != nil {
			_ = reserved.Close()
			if errors.Is(err, os.ErrExist) {
				return "", fmt.Errorf("reserved recovery entry %q already exists", recoveryPath)
			}
			return "", fmt.Errorf("move target to recovery: %w", err)
		}
		actualRecoveryPath, pathErr := recoveryPathForOpenedDirectories(root, recoveryRoot, reserved)
		if pathErr != nil {
			_ = reserved.Close()
			return recoveryPath, fmt.Errorf("locate moved recovery entry %q: %w", recoveryPath, pathErr)
		}
		movedInfo, err := reserved.Lstat("entry")
		if err != nil {
			_ = reserved.Close()
			return actualRecoveryPath, fmt.Errorf("verify moved recovery entry %q: %w", actualRecoveryPath, err)
		}
		if !os.SameFile(targetInfo, movedInfo) {
			_ = reserved.Close()
			return actualRecoveryPath, fmt.Errorf("recovery entry %q is not the original target", actualRecoveryPath)
		}
		_ = reserved.Close()
		return actualRecoveryPath, nil
	}
	return "", errors.New("could not allocate a unique recovery path")
}

func ensureRecoveryDirectory(root *os.Root) (*os.Root, error) {
	info, err := root.Lstat(recoveryDirName)
	if errors.Is(err, os.ErrNotExist) {
		if mkdirErr := root.Mkdir(recoveryDirName, 0o700); mkdirErr != nil && !errors.Is(mkdirErr, os.ErrExist) {
			return nil, fmt.Errorf("create recovery directory: %w", mkdirErr)
		}
		info, err = root.Lstat(recoveryDirName)
	}
	if err != nil {
		return nil, fmt.Errorf("inspect recovery directory: %w", err)
	}
	if info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return nil, errors.New("recovery directory is not a non-symlink directory")
	}
	recovery, err := root.OpenRoot(recoveryDirName)
	if err != nil {
		return nil, fmt.Errorf("open recovery directory: %w", err)
	}
	opened, statErr := recovery.Stat(".")
	if statErr != nil || !os.SameFile(info, opened) {
		_ = recovery.Close()
		if statErr != nil {
			return nil, statErr
		}
		return nil, errors.New("recovery directory changed while opening")
	}
	if err := recovery.Chmod(".", 0o700); err != nil {
		_ = recovery.Close()
		return nil, fmt.Errorf("make recovery directory private: %w", err)
	}
	return recovery, nil
}

func preservePartial(root *os.Root, target string, openedParent *os.Root, created bool) (string, error) {
	if !created {
		return "", nil
	}
	info, err := openedParent.Lstat(path.Base(target))
	if errors.Is(err, os.ErrNotExist) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if info.Mode()&os.ModeSymlink != 0 || info.IsDir() || info.Mode().IsRegular() {
		return moveToRecovery(root, target, openedParent, nil)
	}
	return moveToRecovery(root, target, openedParent, nil)
}

func matchesExpectedState(actual fingerprint, expected *expectedState) bool {
	if expected == nil || actual.State != expected.State {
		return false
	}
	if expected.Mode != nil && (!actual.HasMode || actual.Mode != *expected.Mode) {
		return false
	}
	if expected.SHA256 != "" && actual.SHA256 != expected.SHA256 {
		return false
	}
	return true
}

func sameFingerprint(left, right fingerprint) bool {
	return left.State == right.State && left.HasMode == right.HasMode && (!left.HasMode || left.Mode == right.Mode) && left.SHA256 == right.SHA256
}

func sameOwnershipDigest(left, right fingerprint) bool {
	return left.State == right.State && left.SHA256 == right.SHA256
}

func fileModeFromNumber(mode uint32) os.FileMode {
	result := os.FileMode(mode & 0o777)
	if mode&0o4000 != 0 {
		result |= os.ModeSetuid
	}
	if mode&0o2000 != 0 {
		result |= os.ModeSetgid
	}
	if mode&0o1000 != 0 {
		result |= os.ModeSticky
	}
	return result
}

func modeNumber(mode os.FileMode) uint32 {
	result := uint32(mode.Perm())
	if mode&os.ModeSetuid != 0 {
		result |= 0o4000
	}
	if mode&os.ModeSetgid != 0 {
		result |= 0o2000
	}
	if mode&os.ModeSticky != 0 {
		result |= 0o1000
	}
	return result
}

func hashString(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func nodeLocaleLess(left, right string) bool {
	return compareNodeLocale(left, right) < 0
}

func compareNodeLocale(left, right string) int {
	leftRunes := []rune(left)
	rightRunes := []rune(right)
	limit := len(leftRunes)
	if len(rightRunes) < limit {
		limit = len(rightRunes)
	}
	for index := 0; index < limit; index++ {
		leftWeight := nodeLocalePrimaryWeight(leftRunes[index])
		rightWeight := nodeLocalePrimaryWeight(rightRunes[index])
		if leftWeight < rightWeight {
			return -1
		}
		if leftWeight > rightWeight {
			return 1
		}
	}
	if len(leftRunes) < len(rightRunes) {
		return -1
	}
	if len(leftRunes) > len(rightRunes) {
		return 1
	}
	for index := range leftRunes {
		leftRune, rightRune := leftRunes[index], rightRunes[index]
		if leftRune == rightRune {
			continue
		}
		if unicode.ToLower(leftRune) == unicode.ToLower(rightRune) {
			if unicode.IsLower(leftRune) && unicode.IsUpper(rightRune) {
				return -1
			}
			if unicode.IsUpper(leftRune) && unicode.IsLower(rightRune) {
				return 1
			}
		}
		if leftRune < rightRune {
			return -1
		}
		return 1
	}
	return 0
}

func nodeLocalePrimaryWeight(value rune) int {
	switch value {
	case ' ':
		return 1
	case '_':
		return 2
	case '-':
		return 3
	case ',':
		return 4
	case ';':
		return 5
	case ':':
		return 6
	case '!':
		return 7
	case '?':
		return 8
	case '.':
		return 9
	case '\'':
		return 10
	case '(':
		return 11
	case ')':
		return 12
	case '[':
		return 13
	case ']':
		return 14
	case '{':
		return 15
	case '}':
		return 16
	case '@':
		return 17
	case '*':
		return 18
	case '/':
		return 19
	case '\\':
		return 20
	case '&':
		return 21
	case '#':
		return 22
	case '%':
		return 23
	case '`':
		return 24
	case '^':
		return 25
	case '+':
		return 26
	case '<':
		return 27
	case '=':
		return 28
	case '>':
		return 29
	case '|':
		return 30
	case '~':
		return 31
	case '$':
		return 32
	}
	if value >= '0' && value <= '9' {
		return 100 + int(value-'0')
	}
	lower := unicode.ToLower(value)
	if unicode.IsLetter(lower) {
		return 200 + int(lower)
	}
	return 1000 + int(value)
}
