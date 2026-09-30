//go:build darwin

package main

import (
	"errors"
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
	const (
		syscallClassUnix = 0x2000000
		sysRenameatxNP   = 488
		renameExclusive  = 0x4
	)
	_, _, errno := syscall.Syscall6(
		syscallClassUnix+sysRenameatxNP,
		sourceDirectory.Fd(),
		uintptr(unsafe.Pointer(sourcePath)),
		destinationDirectory.Fd(),
		uintptr(unsafe.Pointer(destinationPath)),
		renameExclusive,
		0,
	)
	runtime.KeepAlive(sourcePath)
	runtime.KeepAlive(destinationPath)
	if errno != 0 {
		return errno
	}
	return nil
}
