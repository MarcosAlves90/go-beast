package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"testing"
	"unicode/utf16"
	"unsafe"
)

func TestExplicitRootSymlinkIsAccepted(t *testing.T) {
	tmp := t.TempDir()
	real := filepath.Join(tmp, "real-home")
	if err := os.Mkdir(real, 0o700); err != nil {
		t.Fatal(err)
	}
	rootLink := filepath.Join(tmp, "hermes-home")
	if err := os.Symlink(real, rootLink); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(real, "skills"), 0o700); err != nil {
		t.Fatal(err)
	}
	got, err := runRequest(request{Operation: "fingerprint", Root: rootLink, Path: "skills"}, nil)
	if err != nil {
		t.Fatalf("explicit root symlink should be accepted: %v", err)
	}
	if got.State != "directory" || got.Mode == nil {
		t.Fatalf("unexpected fingerprint: %#v", got)
	}
}

func TestInspectMissingHermesHomeReportsAbsent(t *testing.T) {
	root := filepath.Join(t.TempDir(), "missing-home")
	got, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/go-beast/go-fox"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.State != "absent" {
		t.Fatalf("missing Hermes home should inspect as absent, got %#v", got)
	}
}

func TestInstallCreatesMissingHermesHome(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "missing-home")
	source := filepath.Join(tmp, "source")
	if err := os.Mkdir(source, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "SKILL.md"), []byte("skill"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := runRequest(request{Operation: "install", Root: root, Path: "skills/go-beast/go-fox", Source: source}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "created" {
		t.Fatalf("missing Hermes home should be created during install, got %#v", got)
	}
	contents, err := os.ReadFile(filepath.Join(root, "skills", "go-beast", "go-fox", "SKILL.md"))
	if err != nil || string(contents) != "skill" {
		t.Fatalf("skill copy was not installed under created Hermes home: %q, %v", contents, err)
	}
}

func TestRejectsWindowsSpecialPathComponents(t *testing.T) {
	root := t.TempDir()
	for _, relative := range []string{
		"skills/go-beast/CON",
		"skills/go-beast/skill:stream",
		"skills/go-beast/trailing.",
	} {
		if _, err := runRequest(request{Operation: "fingerprint", Root: root, Path: relative}, nil); err == nil {
			t.Errorf("expected non-portable Windows path component %q to be rejected", relative)
		}
	}
}

func TestRejectsSymlinkedAncestorWithoutTouchingSentinel(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	external := filepath.Join(tmp, "external")
	if err := os.MkdirAll(root, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(external, 0o700); err != nil {
		t.Fatal(err)
	}
	sentinel := filepath.Join(external, "sentinel")
	if err := os.WriteFile(sentinel, []byte("outside"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(external, filepath.Join(root, "skills")); err != nil {
		t.Fatal(err)
	}
	_, err := runRequest(request{Operation: "remove", Root: root, Path: "skills/owned", ExpectedSHA256: strings.Repeat("0", 64)}, nil)
	if err == nil {
		t.Fatal("expected a symlinked ancestor to be rejected")
	}
	contents, readErr := os.ReadFile(sentinel)
	if readErr != nil || string(contents) != "outside" {
		t.Fatalf("outside sentinel changed: %q, %v", contents, readErr)
	}
}

func TestAncestorSwapAfterParentRootOpenCannotRedirectOutside(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	originalSkills := filepath.Join(root, "skills")
	movedSkills := filepath.Join(tmp, "moved-skills")
	externalSkills := filepath.Join(tmp, "external-skills")
	if err := os.MkdirAll(filepath.Join(originalSkills, "owned"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(externalSkills, "owned"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(externalSkills, "owned", "sentinel"), []byte("untouched"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(originalSkills, "owned", "file"), []byte("managed"), 0o600); err != nil {
		t.Fatal(err)
	}
	swap := func() {
		if err := os.Rename(originalSkills, movedSkills); err != nil {
			t.Errorf("move original skills: %v", err)
			return
		}
		if err := os.Symlink(externalSkills, originalSkills); err != nil {
			t.Errorf("replace skills with symlink: %v", err)
		}
	}
	before, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := runRequest(request{Operation: "remove", Root: root, Path: "skills/owned", ExpectedSHA256: before.SHA256}, &testHooks{afterParentsOpened: swap})
	if err == nil && got.Status != "removed" && got.Status != "preserved" {
		t.Fatalf("unexpected result after safe ancestor swap: %#v", got)
	}
	contents, readErr := os.ReadFile(filepath.Join(externalSkills, "owned", "sentinel"))
	if readErr != nil || string(contents) != "untouched" {
		t.Fatalf("outside sentinel changed: %q, %v", contents, readErr)
	}
	originalPath := filepath.Join(movedSkills, "owned", "file")
	if _, statErr := os.Stat(originalPath); statErr == nil {
		return
	}
	if err == nil && got.RecoveryPath != "" {
		recoveryPath := filepath.Join(root, filepath.FromSlash(got.RecoveryPath), "file")
		if _, recoveryErr := os.Stat(recoveryPath); recoveryErr == nil {
			return
		}
	}
	t.Fatal("original target was lost; expected it under moved skills or the reported recovery path")
}

func TestRemovePreservesConcurrentEditBetweenFingerprintAndRename(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	target := filepath.Join(root, "skills", "owned")
	if err := os.MkdirAll(target, 0o700); err != nil {
		t.Fatal(err)
	}
	file := filepath.Join(target, "SKILL.md")
	if err := os.WriteFile(file, []byte("original"), 0o600); err != nil {
		t.Fatal(err)
	}
	before, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	injected := false
	got, err := runRequest(request{Operation: "remove", Root: root, Path: "skills/owned", ExpectedSHA256: before.SHA256}, &testHooks{
		afterFingerprint: func(operation, targetPath string) {
			if operation == "remove" && !injected {
				injected = true
				if writeErr := os.WriteFile(file, []byte("original plus concurrent edit"), 0o600); writeErr != nil {
					t.Errorf("inject concurrent edit: %v", writeErr)
				}
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "preserved" || !injected {
		t.Fatalf("expected preserved concurrent edit, got %#v (injected=%v)", got, injected)
	}
	contents, err := os.ReadFile(file)
	if err != nil || !strings.Contains(string(contents), "concurrent edit") {
		t.Fatalf("concurrent edit was not restored: %q, %v", contents, err)
	}
}

func TestRecoveryMoveDoesNotFollowSwappedTargetAncestor(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows denies renaming the open directory used by this symlink-swap fixture")
	}
	root := filepath.Join(t.TempDir(), "home")
	target := filepath.Join(root, "skills", "go-beast", "owned")
	attackerTarget := filepath.Join(root, "attacker", "go-beast", "owned")
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(attackerTarget), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("managed"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(attackerTarget, []byte("unrelated"), 0o600); err != nil {
		t.Fatal(err)
	}
	before, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/go-beast/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	injected := false
	got, err := runRequest(request{Operation: "remove", Root: root, Path: "skills/go-beast/owned", ExpectedSHA256: before.SHA256}, &testHooks{
		beforeRecoveryMove: func(_, _ string) {
			injected = true
			if renameErr := os.Rename(filepath.Join(root, "skills"), filepath.Join(root, "moved-skills")); renameErr != nil {
				t.Errorf("move target ancestor: %v", renameErr)
				return
			}
			if linkErr := os.Symlink("attacker", filepath.Join(root, "skills")); linkErr != nil {
				t.Errorf("swap target ancestor to in-root symlink: %v", linkErr)
			}
		},
	})
	if !injected {
		t.Fatal("recovery-move hook did not run")
	}
	contents, readErr := os.ReadFile(attackerTarget)
	if readErr != nil || string(contents) != "unrelated" {
		t.Fatalf("symlink swap moved unrelated content: %q, %v", contents, readErr)
	}
	if err != nil || got.Status != "removed" || got.RecoveryPath == "" {
		t.Fatalf("expected a safe move to recovery, got %#v, %v", got, err)
	}
	recovered, readErr := os.ReadFile(filepath.Join(root, filepath.FromSlash(got.RecoveryPath)))
	if readErr != nil || string(recovered) != "managed" {
		t.Fatalf("original target was not recoverable at the reported path: %q, %v", recovered, readErr)
	}
}

func TestRecoveryMoveDoesNotFollowSwappedRecoveryAncestor(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows denies renaming the open recovery directory used by this symlink-swap fixture")
	}
	root := filepath.Join(t.TempDir(), "home")
	target := filepath.Join(root, "skills", "go-beast", "owned")
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("managed"), 0o600); err != nil {
		t.Fatal(err)
	}
	before, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/go-beast/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var attackerEntry string
	injected := false
	got, err := runRequest(request{Operation: "remove", Root: root, Path: "skills/go-beast/owned", ExpectedSHA256: before.SHA256}, &testHooks{
		beforeRecoveryMove: func(_, recoveryPath string) {
			injected = true
			parts := strings.Split(recoveryPath, "/")
			if len(parts) != 3 || parts[0] != recoveryDirName {
				t.Errorf("unexpected recovery path: %q", recoveryPath)
				return
			}
			if renameErr := os.Rename(filepath.Join(root, recoveryDirName), filepath.Join(root, recoveryDirName+"-saved")); renameErr != nil {
				t.Errorf("move opened recovery ancestor: %v", renameErr)
				return
			}
			attackerRoot := filepath.Join(root, "attacker-recovery")
			attackerEntry = filepath.Join(attackerRoot, parts[1], parts[2])
			if mkdirErr := os.MkdirAll(filepath.Dir(attackerEntry), 0o700); mkdirErr != nil {
				t.Errorf("create attacker recovery directory: %v", mkdirErr)
				return
			}
			if writeErr := os.WriteFile(attackerEntry, []byte("pre-existing recovery"), 0o600); writeErr != nil {
				t.Errorf("create recovery sentinel: %v", writeErr)
				return
			}
			if linkErr := os.Symlink("attacker-recovery", filepath.Join(root, recoveryDirName)); linkErr != nil {
				t.Errorf("swap recovery ancestor to in-root symlink: %v", linkErr)
			}
		},
	})
	if !injected {
		t.Fatal("recovery-move hook did not run")
	}
	contents, readErr := os.ReadFile(attackerEntry)
	if readErr != nil || string(contents) != "pre-existing recovery" {
		t.Fatalf("symlink swap overwrote an existing recovery entry: %q, %v", contents, readErr)
	}
	if err != nil || got.Status != "removed" || got.RecoveryPath == "" {
		t.Fatalf("expected a safe move to recovery, got %#v, %v", got, err)
	}
	recovered, readErr := os.ReadFile(filepath.Join(root, filepath.FromSlash(got.RecoveryPath)))
	if readErr != nil || string(recovered) != "managed" {
		t.Fatalf("original target was not recoverable at the reported path: %q, %v", recovered, readErr)
	}
}

func TestUpdateReportsDisplacedAndPartialCopies(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	target := filepath.Join(root, "skills", "go-beast", "owned")
	source := filepath.Join(tmp, "source")
	if err := os.MkdirAll(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "SKILL.md"), []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "SKILL.md"), []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	canonicalSource, err := filepath.EvalSymlinks(source)
	if err != nil {
		t.Fatal(err)
	}
	before, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/go-beast/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	injected := false
	got, err := runRequest(request{Operation: "install", Root: root, Path: "skills/go-beast/owned", Source: canonicalSource, ExpectedSHA256: before.SHA256}, &testHooks{
		afterFingerprint: func(operation, _ string) {
			if operation == "install" && !injected {
				injected = true
				if writeErr := os.WriteFile(filepath.Join(source, "concurrent.txt"), []byte("changed source"), 0o600); writeErr != nil {
					t.Errorf("mutate source after initial fingerprint: %v", writeErr)
				}
			}
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !injected || got.Status != "preserved" || len(got.RecoveryPaths) != 2 {
		t.Fatalf("expected both displaced and partial recovery paths, got %#v", got)
	}
	contentsByPath := map[string]string{}
	for _, recovery := range got.RecoveryPaths {
		contents, readErr := os.ReadFile(filepath.Join(root, filepath.FromSlash(recovery), "SKILL.md"))
		if readErr != nil {
			t.Fatalf("read recovery entry %q: %v", recovery, readErr)
		}
		contentsByPath[recovery] = string(contents)
	}
	seenOld, seenNew := false, false
	for _, contents := range contentsByPath {
		seenOld = seenOld || contents == "old"
		seenNew = seenNew || contents == "new"
	}
	if !seenOld || !seenNew {
		t.Fatalf("old and partial copies were not both reported: %#v", contentsByPath)
	}
}

func TestRestoreSnapshotToAbsentReportsFailureWhenBackupIsMissing(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	backup := filepath.Join(tmp, "backups")
	if err := os.MkdirAll(filepath.Join(root, "skills", "go-beast"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(backup, 0o700); err != nil {
		t.Fatal(err)
	}
	absent := "absent"
	got, err := runRequest(request{
		Operation:     "restore",
		Root:          root,
		Path:          "skills/go-beast/owned",
		BackupPath:    backup,
		Snapshot:      &snapshot{State: "file", Mode: 0o600, Backup: "missing-backup"},
		ExpectedState: &expectedState{State: absent},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "failed" || got.Error == "" {
		t.Fatalf("failed snapshot restoration must be explicit, got %#v", got)
	}
}

func TestInstallCreateConflictDoesNotOverwriteExistingTarget(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	source := filepath.Join(tmp, "source")
	target := filepath.Join(root, "skills", "owned")
	if err := os.MkdirAll(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(source, 0o700); err != nil {
		t.Fatal(err)
	}
	source, err := filepath.EvalSymlinks(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "user.txt"), []byte("user data"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "SKILL.md"), []byte("skill"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := runRequest(request{Operation: "install", Root: root, Path: "skills/owned", Source: source}, nil)
	if err != nil {
		t.Fatal(err)
	}
	contents, readErr := os.ReadFile(filepath.Join(target, "user.txt"))
	if readErr != nil || string(contents) != "user data" {
		t.Fatalf("existing target was overwritten: %q, %v", contents, readErr)
	}
	if got.Status != "preserved" {
		t.Fatalf("expected create conflict to be preserved, got %#v", got)
	}
}

func TestInstallSourceMayHaveSymlinkedAncestor(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	if err := os.Mkdir(root, 0o700); err != nil {
		t.Fatal(err)
	}
	realSource := filepath.Join(tmp, "release", "skills", "go-fox")
	if err := os.MkdirAll(realSource, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(realSource, "SKILL.md"), []byte("skill"), 0o600); err != nil {
		t.Fatal(err)
	}
	sourceAlias := filepath.Join(tmp, "current")
	if err := os.Symlink(filepath.Join(tmp, "release"), sourceAlias); err != nil {
		t.Fatal(err)
	}
	got, err := runRequest(request{
		Operation: "install", Root: root, Path: "skills/go-beast/go-fox",
		Source: filepath.Join(sourceAlias, "skills", "go-fox"),
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "created" {
		t.Fatalf("expected install through a release-current symlink to succeed, got %#v", got)
	}
	contents, err := os.ReadFile(filepath.Join(root, "skills", "go-beast", "go-fox", "SKILL.md"))
	if err != nil || string(contents) != "skill" {
		t.Fatalf("skill copy was not installed: %q, %v", contents, err)
	}
}

func TestSnapshotAndFingerprintUseStableTreeDigest(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	target := filepath.Join(root, "skills", "owned")
	if err := os.MkdirAll(filepath.Join(target, "nested"), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(target, "nested", "a.txt"), []byte("alpha"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("nested/a.txt", filepath.Join(target, "link")); err != nil {
		t.Fatal(err)
	}
	fingerprint, err := runRequest(request{Operation: "fingerprint", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(tmp, "transaction", "directory-0.bak")
	if err := os.Mkdir(filepath.Dir(backup), 0o700); err != nil {
		t.Fatal(err)
	}
	got, err := runRequest(request{Operation: "snapshot", Root: root, Path: "skills/owned", BackupPath: backup}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Snapshot == nil || got.Snapshot.State != "directory" || got.Snapshot.Backup != filepath.Base(backup) {
		t.Fatalf("unexpected snapshot metadata: %#v", got.Snapshot)
	}
	if fingerprint.State != got.Snapshot.State || fingerprint.Mode == nil || *fingerprint.Mode != got.Snapshot.Mode {
		t.Fatalf("snapshot fingerprint mismatch: before=%#v snapshot=%#v", fingerprint, got)
	}
	if link, err := os.Readlink(filepath.Join(backup, "link")); err != nil || filepath.ToSlash(link) != "nested/a.txt" {
		t.Fatalf("snapshot did not preserve symlink: %q, %v", link, err)
	}
}

func TestOwnershipAndTransactionDigestsRemainDistinct(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	tree := filepath.Join(root, "skills", "owned")
	if err := os.MkdirAll(filepath.Join(tree, "a"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tree, "a", "f.txt"), []byte("one"), 0o640); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink("a/f.txt", filepath.Join(tree, "link")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tree, "z.txt"), []byte("zee"), 0o600); err != nil {
		t.Fatal(err)
	}
	for file, mode := range map[string]os.FileMode{
		tree: 0o751, filepath.Join(tree, "a"): 0o700,
		filepath.Join(tree, "a", "f.txt"): 0o640, filepath.Join(tree, "z.txt"): 0o600,
	} {
		if err := os.Chmod(file, mode); err != nil {
			t.Fatal(err)
		}
	}
	inspect, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	fingerprint, err := runRequest(request{Operation: "fingerprint", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	linkTarget, err := os.Readlink(filepath.Join(tree, "link"))
	if err != nil {
		t.Fatal(err)
	}
	modeFor := func(path string) string {
		info, err := os.Lstat(path)
		if err != nil {
			t.Fatalf("lstat %q: %v", path, err)
		}
		return strconv.FormatUint(uint64(modeNumber(info.Mode())), 8)
	}
	rootMode := modeFor(tree)
	directoryMode := modeFor(filepath.Join(tree, "a"))
	fileMode := modeFor(filepath.Join(tree, "a", "f.txt"))
	linkMode := modeFor(filepath.Join(tree, "link"))
	zeeMode := modeFor(filepath.Join(tree, "z.txt"))
	hash := func(value string) string {
		sum := sha256.Sum256([]byte(value))
		return hex.EncodeToString(sum[:])
	}
	fileHash := func(value string) string {
		sum := sha256.Sum256([]byte(value))
		return hex.EncodeToString(sum[:])
	}
	ownershipRows := "a/f.txt\x00file\x00" + fileHash("one") + "\n" +
		"link\x00symlink\x00" + hash("symlink:"+linkTarget) + "\n" +
		"z.txt\x00file\x00" + fileHash("zee") + "\n"
	if inspect.SHA256 != hash(ownershipRows) {
		t.Fatalf("inspect digest differs from sourceDigest format: got %s want %s", inspect.SHA256, hash(ownershipRows))
	}
	fingerprintRows := ".\x00directory\x00" + rootMode + "\n" +
		"a\x00directory\x00" + directoryMode + "\n" +
		"a/f.txt\x00file\x00" + fileMode + "\x00one\n" +
		"link\x00symlink\x00" + linkMode + "\x00" + linkTarget + "\n" +
		"z.txt\x00file\x00" + zeeMode + "\x00zee\n"
	rootHandle, err := os.OpenRoot(root)
	if err != nil {
		t.Fatal(err)
	}
	rootInfo, err := rootHandle.Lstat("skills/owned")
	if err != nil {
		t.Fatal(err)
	}
	var actualRows bytes.Buffer
	if err := appendTargetFingerprint(rootHandle, "skills/owned", ".", rootInfo, 0, &actualRows); err != nil {
		t.Fatal(err)
	}
	_ = rootHandle.Close()
	if actualRows.String() != fingerprintRows {
		t.Fatalf("transaction fingerprint rows mismatch: got %q want %q", actualRows.String(), fingerprintRows)
	}
	if fingerprint.SHA256 != hash(fingerprintRows) {
		t.Fatalf("fingerprint digest differs from targetFingerprint format: got %s want %s", fingerprint.SHA256, hash(fingerprintRows))
	}
	if err := os.Chmod(filepath.Join(tree, "a", "f.txt"), 0o400); err != nil {
		t.Fatal(err)
	}
	inspectAfter, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	fingerprintAfter, err := runRequest(request{Operation: "fingerprint", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if inspectAfter.SHA256 != inspect.SHA256 || fingerprintAfter.SHA256 == fingerprint.SHA256 {
		t.Fatal("ownership digest must ignore modes while transaction fingerprint must include them")
	}
}

func TestRestoreRetainsDisplacedTargetInRecovery(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	target := filepath.Join(root, "skills", "owned")
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("installed"), 0o640); err != nil {
		t.Fatal(err)
	}
	backupDirectory := filepath.Join(tmp, "transaction")
	if err := os.Mkdir(backupDirectory, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(backupDirectory, "file-0.bak"), []byte("previous"), 0o600); err != nil {
		t.Fatal(err)
	}
	expected, err := runRequest(request{Operation: "fingerprint", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := runRequest(request{
		Operation: "restore", Root: root, Path: "skills/owned", BackupPath: backupDirectory,
		Snapshot:      &snapshot{State: "file", Mode: 0o640, Backup: "file-0.bak"},
		ExpectedState: &expectedState{State: expected.State, Mode: expected.Mode, SHA256: expected.SHA256},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "restored" || got.RecoveryPath == "" {
		t.Fatalf("restore should report its retained displaced target: %#v", got)
	}
	contents, err := os.ReadFile(target)
	if err != nil || string(contents) != "previous" {
		t.Fatalf("snapshot was not restored: %q, %v", contents, err)
	}
	recovered := filepath.Join(root, filepath.FromSlash(got.RecoveryPath))
	contents, err = os.ReadFile(recovered)
	if err != nil || string(contents) != "installed" {
		t.Fatalf("displaced target was not retained at %s: %q, %v", got.RecoveryPath, contents, err)
	}
}

func TestImmediateRollbackWithoutInstalledFingerprintRestoresSnapshot(t *testing.T) {
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	target := filepath.Join(root, "skills", "owned")
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("partially installed"), 0o640); err != nil {
		t.Fatal(err)
	}
	backupDirectory := filepath.Join(tmp, "transaction")
	if err := os.Mkdir(backupDirectory, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(backupDirectory, "file-0.bak"), []byte("previous"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := runRequest(request{
		Operation: "restore", Root: root, Path: "skills/owned", BackupPath: backupDirectory,
		Snapshot: &snapshot{State: "file", Mode: 0o640, Backup: "file-0.bak"},
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Status != "restored" || got.RecoveryPath == "" {
		t.Fatalf("immediate rollback should restore and retain the partial target: %#v", got)
	}
	contents, err := os.ReadFile(target)
	if err != nil || string(contents) != "previous" {
		t.Fatalf("snapshot was not restored: %q, %v", contents, err)
	}
	recovered := filepath.Join(root, filepath.FromSlash(got.RecoveryPath))
	contents, err = os.ReadFile(recovered)
	if err != nil || string(contents) != "partially installed" {
		t.Fatalf("partial target was not retained at %s: %q, %v", got.RecoveryPath, contents, err)
	}
}

func requireModeRestriction(t *testing.T) {
	t.Helper()
	probe := filepath.Join(t.TempDir(), "mode-probe")
	if err := os.WriteFile(probe, []byte("probe"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(probe, 0); err != nil {
		t.Fatal(err)
	}
	if _, err := os.ReadFile(probe); err == nil {
		t.Skip("the current user can bypass mode restrictions")
	}
}

func TestInstallPostMoveFingerprintFailureKeepsRecoveryPath(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("mode-based fingerprint failure is Unix-specific")
	}
	requireModeRestriction(t)
	tmp := t.TempDir()
	root := filepath.Join(tmp, "home")
	target := filepath.Join(root, "skills", "owned")
	source := filepath.Join(tmp, "source")
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(source, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "SKILL.md"), []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	before, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	injected := false
	got, err := runRequest(request{Operation: "install", Root: root, Path: "skills/owned", Source: source, ExpectedSHA256: before.SHA256}, &testHooks{
		beforeRecoveryMove: func(_, _ string) {
			injected = true
			if chmodErr := os.Chmod(target, 0); chmodErr != nil {
				t.Errorf("make moved target unreadable: %v", chmodErr)
			}
		},
	})
	if err != nil {
		t.Fatalf("expected an explicit failure response, got %#v, %v", got, err)
	}
	if !injected || got.Status != "failed" || got.Error == "" || len(got.RecoveryPaths) != 1 {
		t.Fatalf("expected failed status and the retained target path, got %#v", got)
	}
	recovery := filepath.Join(root, filepath.FromSlash(got.RecoveryPaths[0]))
	if err := os.Chmod(recovery, 0o600); err != nil {
		t.Fatalf("restore recovery file permissions: %v", err)
	}
	contents, err := os.ReadFile(recovery)
	if err != nil || string(contents) != "old" {
		t.Fatalf("moved target was not retained at the reported path: %q, %v", contents, err)
	}
}

func TestRestorePostFingerprintFailureKeepsRecoveryPaths(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("mode-based fingerprint failure is Unix-specific")
	}
	requireModeRestriction(t)
	for _, withExpectedState := range []bool{true, false} {
		name := "without-expected-state"
		if withExpectedState {
			name = "with-expected-state"
		}
		t.Run(name, func(t *testing.T) {
			tmp := t.TempDir()
			root := filepath.Join(tmp, "home")
			target := filepath.Join(root, "skills", "owned")
			backup := filepath.Join(tmp, "transaction")
			if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.Mkdir(backup, 0o700); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(target, []byte("installed"), 0o600); err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(filepath.Join(backup, "file-0.bak"), []byte("previous"), 0o600); err != nil {
				t.Fatal(err)
			}
			req := request{Operation: "restore", Root: root, Path: "skills/owned", BackupPath: backup,
				Snapshot: &snapshot{State: "file", Mode: 0o600, Backup: "file-0.bak"}}
			if withExpectedState {
				current, err := runRequest(request{Operation: "fingerprint", Root: root, Path: "skills/owned"}, nil)
				if err != nil {
					t.Fatal(err)
				}
				req.ExpectedState = &expectedState{State: current.State, Mode: current.Mode, SHA256: current.SHA256}
			}
			got, err := runRequest(req, &testHooks{afterSnapshotCopy: func(string) {
				if chmodErr := os.Chmod(target, 0); chmodErr != nil {
					t.Errorf("make restored snapshot unreadable: %v", chmodErr)
				}
			}})
			if err != nil {
				t.Fatalf("expected an explicit failure response, got %#v, %v", got, err)
			}
			if got.Status != "failed" || got.Error == "" || len(got.RecoveryPaths) != 2 {
				t.Fatalf("expected failed status with displaced and partial paths, got %#v", got)
			}
			seenInstalled, seenPrevious := false, false
			for _, recoveryPath := range got.RecoveryPaths {
				recovery := filepath.Join(root, filepath.FromSlash(recoveryPath))
				if err := os.Chmod(recovery, 0o600); err != nil {
					t.Fatalf("restore permissions for %q: %v", recoveryPath, err)
				}
				contents, err := os.ReadFile(recovery)
				if err != nil {
					t.Fatalf("read recovery path %q: %v", recoveryPath, err)
				}
				seenInstalled = seenInstalled || string(contents) == "installed"
				seenPrevious = seenPrevious || string(contents) == "previous"
			}
			if !seenInstalled || !seenPrevious {
				t.Fatalf("displaced and partial snapshot copies were not both retained")
			}
		})
	}
}

func TestWindowsRecoveryMoveWorksAndDoesNotOverwrite(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("native Windows handle access must be tested on Windows")
	}
	root := filepath.Join(t.TempDir(), "home")
	target := filepath.Join(root, "skills", "owned")
	if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("managed"), 0o600); err != nil {
		t.Fatal(err)
	}
	before, err := runRequest(request{Operation: "inspect", Root: root, Path: "skills/owned"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err := runRequest(request{Operation: "remove", Root: root, Path: "skills/owned", ExpectedSHA256: before.SHA256}, nil)
	if err != nil || got.Status != "removed" || len(got.RecoveryPaths) != 1 {
		t.Fatalf("Windows recovery move should succeed, got %#v, %v", got, err)
	}
	contents, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(got.RecoveryPaths[0])))
	if err != nil || string(contents) != "managed" {
		t.Fatalf("recovery entry was not moved intact: %q, %v", contents, err)
	}

	directory := filepath.Join(root, "skills", "directory")
	if err := os.MkdirAll(filepath.Join(directory, "nested"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, "nested", "SKILL.md"), []byte("directory-managed"), 0o600); err != nil {
		t.Fatal(err)
	}
	before, err = runRequest(request{Operation: "inspect", Root: root, Path: "skills/directory"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	got, err = runRequest(request{Operation: "remove", Root: root, Path: "skills/directory", ExpectedSHA256: before.SHA256}, nil)
	if err != nil || got.Status != "removed" || len(got.RecoveryPaths) != 1 {
		t.Fatalf("Windows directory recovery move should succeed, got %#v, %v", got, err)
	}
	recoveredDirectory := filepath.Join(root, filepath.FromSlash(got.RecoveryPaths[0]))
	if info, statErr := os.Stat(recoveredDirectory); statErr != nil || !info.IsDir() {
		t.Fatalf("directory recovery entry was not moved intact: %v, %v", info, statErr)
	}
	contents, err = os.ReadFile(filepath.Join(recoveredDirectory, "nested", "SKILL.md"))
	if err != nil || string(contents) != "directory-managed" {
		t.Fatalf("recovered directory contents changed: %q, %v", contents, err)
	}

	target = filepath.Join(root, "skills", "collision")
	if err := os.WriteFile(target, []byte("source"), 0o600); err != nil {
		t.Fatal(err)
	}
	before, err = runRequest(request{Operation: "inspect", Root: root, Path: "skills/collision"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	var sentinel string
	got, err = runRequest(request{Operation: "remove", Root: root, Path: "skills/collision", ExpectedSHA256: before.SHA256}, &testHooks{
		beforeRecoveryMove: func(_, recoveryPath string) {
			sentinel = filepath.Join(root, filepath.FromSlash(recoveryPath))
			if writeErr := os.WriteFile(sentinel, []byte("existing"), 0o600); writeErr != nil {
				t.Errorf("create recovery sentinel: %v", writeErr)
			}
		},
	})
	if err == nil && got.Status == "removed" {
		t.Fatalf("recovery move overwrote an existing entry")
	}
	contents, err = os.ReadFile(sentinel)
	if err != nil || string(contents) != "existing" {
		t.Fatalf("existing recovery entry changed: %q, %v", contents, err)
	}
	contents, err = os.ReadFile(target)
	if err != nil || string(contents) != "source" {
		t.Fatalf("source changed after no-replace collision: %q, %v", contents, err)
	}
}

func TestBuildWindowsNtRenameInformationUsesNoReplaceAndRelativeHandle(t *testing.T) {
	const destinationDirectory = uintptr(42)
	const destinationName = "entry"
	name16 := utf16.Encode([]rune(destinationName))
	legacy, err := buildWindowsNtRenameInformation(destinationName, destinationDirectory)
	if err != nil {
		t.Fatal(err)
	}
	if legacy.ReplaceIfExists != 0 || legacy.RootDirectory != destinationDirectory {
		t.Fatalf("legacy rename info must retain no-replace semantics and target handle: %#v", legacy)
	}
	if legacy.FileNameLength != uint32(len(name16)*2) || legacy.FileName[:len(name16)][0] != name16[0] {
		t.Fatalf("unexpected legacy rename name or length: %#v", legacy)
	}
	if legacy.FileName[len(name16)] != 0 {
		t.Fatal("legacy rename filename buffer must terminate after the declared byte length")
	}
	type legacyHeader struct {
		ReplaceIfExists byte
		Padding         [7]byte
		RootDirectory   uintptr
		FileNameLength  uint32
		FileName        [1]uint16
	}
	var legacyABI legacyHeader
	if unsafe.Offsetof(legacy.RootDirectory) != unsafe.Offsetof(legacyABI.RootDirectory) ||
		unsafe.Offsetof(legacy.FileNameLength) != unsafe.Offsetof(legacyABI.FileNameLength) ||
		unsafe.Offsetof(legacy.FileName) != unsafe.Offsetof(legacyABI.FileName) {
		t.Fatalf("legacy NT rename offsets do not match: root=%d/%d length=%d/%d name=%d/%d",
			unsafe.Offsetof(legacy.RootDirectory), unsafe.Offsetof(legacyABI.RootDirectory),
			unsafe.Offsetof(legacy.FileNameLength), unsafe.Offsetof(legacyABI.FileNameLength),
			unsafe.Offsetof(legacy.FileName), unsafe.Offsetof(legacyABI.FileName))
	}
	if got, minimum := unsafe.Sizeof(legacy), unsafe.Sizeof(legacyABI)+uintptr(legacy.FileNameLength); got < minimum {
		t.Fatalf("legacy NT rename buffer too small: got %d bytes, need %d", got, minimum)
	}

	extended, err := buildWindowsNtRenameInformationEx(destinationName, destinationDirectory)
	if err != nil {
		t.Fatal(err)
	}
	if extended.Flags != 0 || extended.RootDirectory != destinationDirectory || extended.FileNameLength != uint32(len(name16)*2) {
		t.Fatalf("extended rename info must use flags=0, the destination handle, and the UTF-16 byte length: %#v", extended)
	}
	if extended.FileName[len(name16)] != 0 {
		t.Fatal("extended rename filename buffer must terminate after the declared byte length")
	}
	type extendedHeader struct {
		Flags          uint32
		Padding        [4]byte
		RootDirectory  uintptr
		FileNameLength uint32
		FileName       [1]uint16
	}
	var extendedABI extendedHeader
	if unsafe.Offsetof(extended.RootDirectory) != unsafe.Offsetof(extendedABI.RootDirectory) ||
		unsafe.Offsetof(extended.FileNameLength) != unsafe.Offsetof(extendedABI.FileNameLength) ||
		unsafe.Offsetof(extended.FileName) != unsafe.Offsetof(extendedABI.FileName) {
		t.Fatalf("extended NT rename offsets do not match: root=%d/%d length=%d/%d name=%d/%d",
			unsafe.Offsetof(extended.RootDirectory), unsafe.Offsetof(extendedABI.RootDirectory),
			unsafe.Offsetof(extended.FileNameLength), unsafe.Offsetof(extendedABI.FileNameLength),
			unsafe.Offsetof(extended.FileName), unsafe.Offsetof(extendedABI.FileName))
	}
	if got, minimum := unsafe.Sizeof(extended), unsafe.Sizeof(extendedABI)+uintptr(extended.FileNameLength); got < minimum {
		t.Fatalf("extended NT rename buffer too small: got %d bytes, need %d", got, minimum)
	}
	if windowsFileRenameInformationClass != 10 || windowsFileRenameInformationExClass != 65 {
		t.Fatalf("unexpected NT rename information classes: legacy=%d extended=%d", windowsFileRenameInformationClass, windowsFileRenameInformationExClass)
	}
	if _, err := buildWindowsNtRenameInformation(strings.Repeat("a", len(legacy.FileName)), destinationDirectory); err == nil {
		t.Fatal("expected an overlong legacy rename leaf to be rejected")
	}
	if _, err := buildWindowsNtRenameInformationEx(strings.Repeat("a", len(extended.FileName)), destinationDirectory); err == nil {
		t.Fatal("expected an overlong extended rename leaf to be rejected")
	}
}

func TestWindowsRenameRootDirectoryAccessIncludesRelativeRenameRights(t *testing.T) {
	const requiredAccess = uint32(0x00000020 | 0x00000080 | 0x00100000)
	if got := windowsRenameRootDirectoryAccess & requiredAccess; got != requiredAccess {
		t.Fatalf("relative rename RootDirectory access omits FILE_TRAVERSE, FILE_READ_ATTRIBUTES, or SYNCHRONIZE: got %#x need %#x", got, requiredAccess)
	}
}
