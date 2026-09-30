//go:build linux

package main

import (
	"errors"
	"fmt"
	"os"
	"runtime"
	"syscall"
	"unsafe"
)

func renameNoReplace(sourceParent *os.Root, sourceName string, destinationContainer *os.Root, destinationDirectoryName, destinationName string, expectedDestinationInfo os.FileInfo) error {
	if err := validateMoveNames(sourceName, destinationDirectoryName, destinationName); err != nil {
		return err
	}
	destinationInfo, err := destinationContainer.Lstat(destinationDirectoryName)
	if err != nil {
		return err
	}
	if destinationInfo.Mode()&os.ModeSymlink != 0 || !destinationInfo.IsDir() || !os.SameFile(expectedDestinationInfo, destinationInfo) {
		return errors.New("recovery destination directory changed before move")
	}
	destinationRoot, err := destinationContainer.OpenRoot(destinationDirectoryName)
	if err != nil {
		return err
	}
	defer destinationRoot.Close()
	openedDestinationInfo, err := destinationRoot.Stat(".")
	if err != nil {
		return err
	}
	if !os.SameFile(expectedDestinationInfo, openedDestinationInfo) {
		return errors.New("recovery destination directory changed while opening")
	}
	destinationInfo, err = destinationContainer.Lstat(destinationDirectoryName)
	if err != nil {
		return err
	}
	if destinationInfo.Mode()&os.ModeSymlink != 0 || !os.SameFile(expectedDestinationInfo, destinationInfo) {
		return errors.New("recovery destination directory changed after opening")
	}
	sourceDirectory, err := sourceParent.Open(".")
	if err != nil {
		return err
	}
	defer sourceDirectory.Close()
	destinationDirectory, err := destinationRoot.Open(".")
	if err != nil {
		return err
	}
	defer destinationDirectory.Close()
	sourcePath, err := syscall.BytePtrFromString(sourceName)
	if err != nil {
		return err
	}
	destinationPath, err := syscall.BytePtrFromString(destinationName)
	if err != nil {
		return err
	}
	const renameNoReplaceFlag = 1
	var syscallNumber uintptr
	switch runtime.GOARCH {
	case "amd64":
		syscallNumber = 316
	case "arm64":
		syscallNumber = 276
	default:
		return fmt.Errorf("no renameat2 syscall number for linux/%s", runtime.GOARCH)
	}
	_, _, errno := syscall.Syscall6(
		syscallNumber,
		sourceDirectory.Fd(),
		uintptr(unsafe.Pointer(sourcePath)),
		destinationDirectory.Fd(),
		uintptr(unsafe.Pointer(destinationPath)),
		renameNoReplaceFlag,
		0,
	)
	runtime.KeepAlive(sourcePath)
	runtime.KeepAlive(destinationPath)
	if errno != 0 {
		return errno
	}
	return nil
}
