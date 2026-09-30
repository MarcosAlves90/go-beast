//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"runtime"
	"syscall"
	"unsafe"
)

const (
	fileOpenReparsePoint    = 0x00200000
	fileOpenForBackupIntent = 0x00004000
	fileSynchronousIO       = 0x00000020
	fileDirectory           = 0x00000001
	fileReadAttributes      = 0x00000080
	accessDelete            = 0x00010000
	objCaseInsensitive      = 0x00000040
)

type ntUnicodeString struct {
	Length        uint16
	MaximumLength uint16
	Buffer        *uint16
}

type ntObjectAttributes struct {
	Length                   uint32
	_                        uint32
	RootDirectory            syscall.Handle
	ObjectName               *ntUnicodeString
	Attributes               uint32
	_                        uint32
	SecurityDescriptor       uintptr
	SecurityQualityOfService uintptr
}

type ntIOStatusBlock struct {
	Status      uintptr
	Information uintptr
}

var (
	ntdll                    = syscall.NewLazyDLL("ntdll.dll")
	ntOpenFileProc           = ntdll.NewProc("NtOpenFile")
	ntSetInformationFileProc = ntdll.NewProc("NtSetInformationFile")
	rtlNtStatusToDosError    = ntdll.NewProc("RtlNtStatusToDosError")
)

func openWindowsRootRelative(parent *os.Root, name string, desiredAccess, options uint32) (*os.File, error) {
	parentDirectory, err := parent.Open(".")
	if err != nil {
		return nil, err
	}
	defer parentDirectory.Close()
	name16, err := syscall.UTF16FromString(name)
	if err != nil {
		return nil, err
	}
	objectName := ntUnicodeString{
		Length:        uint16((len(name16) - 1) * 2),
		MaximumLength: uint16(len(name16) * 2),
		Buffer:        &name16[0],
	}
	attributes := ntObjectAttributes{
		Length:        uint32(unsafe.Sizeof(ntObjectAttributes{})),
		RootDirectory: syscall.Handle(parentDirectory.Fd()),
		ObjectName:    &objectName,
		Attributes:    objCaseInsensitive,
	}
	var ioStatus ntIOStatusBlock
	var handle syscall.Handle
	status, _, _ := ntOpenFileProc.Call(
		uintptr(unsafe.Pointer(&handle)),
		uintptr(desiredAccess),
		uintptr(unsafe.Pointer(&attributes)),
		uintptr(unsafe.Pointer(&ioStatus)),
		uintptr(syscall.FILE_SHARE_READ|syscall.FILE_SHARE_WRITE|syscall.FILE_SHARE_DELETE),
		uintptr(options|fileOpenForBackupIntent|fileSynchronousIO),
	)
	runtime.KeepAlive(name16)
	runtime.KeepAlive(&objectName)
	runtime.KeepAlive(&attributes)
	runtime.KeepAlive(&ioStatus)
	if int32(status) < 0 {
		windowsError, _, _ := rtlNtStatusToDosError.Call(status)
		return nil, syscall.Errno(windowsError)
	}
	file := os.NewFile(uintptr(handle), name)
	if file == nil {
		_ = syscall.CloseHandle(handle)
		return nil, errors.New("could not wrap opened Windows file handle")
	}
	return file, nil
}

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
	destinationDirectory, err := openWindowsRootRelative(destinationContainer, destinationDirectoryName, windowsRenameRootDirectoryAccess, fileDirectory|fileOpenReparsePoint)
	if err != nil {
		return fmt.Errorf("open recovery destination directory for relative rename: %w", err)
	}
	defer destinationDirectory.Close()
	openedDestinationInfo, err := destinationDirectory.Stat()
	if err != nil {
		return fmt.Errorf("stat opened recovery destination directory: %w", err)
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

	sourceFile, err := openWindowsRootRelative(sourceParent, sourceName, accessDelete|fileReadAttributes|syscall.SYNCHRONIZE, fileOpenReparsePoint)
	if err != nil {
		return fmt.Errorf("open recovery source for rename: %w", err)
	}
	defer sourceFile.Close()
	expectedSourceInfo, err := sourceParent.Lstat(sourceName)
	if err != nil {
		return fmt.Errorf("inspect opened recovery source: %w", err)
	}
	openedSourceInfo, err := sourceFile.Stat()
	if err != nil {
		return fmt.Errorf("stat opened recovery source: %w", err)
	}
	if !os.SameFile(expectedSourceInfo, openedSourceInfo) {
		return errors.New("recovery source changed while opening")
	}

	return renameWindowsHandleRelativeNoReplace(sourceFile, destinationDirectory, destinationName)
}

func renameWindowsHandleRelativeNoReplace(source, destinationDirectory *os.File, destinationName string) error {
	extended, err := buildWindowsNtRenameInformationEx(destinationName, destinationDirectory.Fd())
	if err != nil {
		return err
	}
	var ioStatus ntIOStatusBlock
	status, _, _ := ntSetInformationFileProc.Call(
		source.Fd(),
		uintptr(unsafe.Pointer(&ioStatus)),
		uintptr(unsafe.Pointer(&extended)),
		unsafe.Sizeof(extended),
		uintptr(windowsFileRenameInformationExClass),
	)
	runtime.KeepAlive(&extended)
	runtime.KeepAlive(&ioStatus)
	if status == 0 {
		return nil
	}
	extendedErr := windowsNTStatusError(status)

	legacy, err := buildWindowsNtRenameInformation(destinationName, destinationDirectory.Fd())
	if err != nil {
		return err
	}
	ioStatus = ntIOStatusBlock{}
	status, _, _ = ntSetInformationFileProc.Call(
		source.Fd(),
		uintptr(unsafe.Pointer(&ioStatus)),
		uintptr(unsafe.Pointer(&legacy)),
		unsafe.Sizeof(legacy),
		uintptr(windowsFileRenameInformationClass),
	)
	runtime.KeepAlive(&legacy)
	runtime.KeepAlive(&ioStatus)
	if status == 0 {
		return nil
	}
	legacyErr := windowsNTStatusError(status)
	return fmt.Errorf("NtSetInformationFile(FileRenameInformationEx) failed: %v; FileRenameInformation fallback failed: %w", extendedErr, legacyErr)
}

func windowsNTStatusError(status uintptr) error {
	windowsError, _, _ := rtlNtStatusToDosError.Call(status)
	if windowsError == 0 {
		return fmt.Errorf("NTSTATUS 0x%08x", uint32(status))
	}
	return fmt.Errorf("NTSTATUS 0x%08x: %w", uint32(status), syscall.Errno(windowsError))
}
