//go:build windows

package main

import (
	"encoding/binary"
	"errors"
	"fmt"
	"os"
	"runtime"
	"syscall"
	"unicode/utf16"
	"unsafe"
)

const (
	fileOpenReparsePoint    = 0x00200000
	fileOpenForBackupIntent = 0x00004000
	fileSynchronousIO       = 0x00000020
	fileDirectory           = 0x00000001
	fileReadAttributes      = 0x00000080
	fileAddFile             = 0x00000002
	fileAddSubdirectory     = 0x00000004
	accessDelete            = 0x00010000
	objCaseInsensitive      = 0x00000040
	fileRenameInfo          = 3
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
	ntdll                  = syscall.NewLazyDLL("ntdll.dll")
	ntOpenFileProc         = ntdll.NewProc("NtOpenFile")
	rtlNtStatusToDosError  = ntdll.NewProc("RtlNtStatusToDosError")
	kernel32               = syscall.NewLazyDLL("kernel32.dll")
	setFileInformationProc = kernel32.NewProc("SetFileInformationByHandle")
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
	destinationDirectory, err := openWindowsRootRelative(destinationContainer, destinationDirectoryName, fileAddFile|fileAddSubdirectory|fileReadAttributes|syscall.SYNCHRONIZE, fileDirectory|fileOpenReparsePoint)
	if err != nil {
		return err
	}
	defer destinationDirectory.Close()
	openedDestinationInfo, err := destinationDirectory.Stat()
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

	sourceFile, err := openWindowsRootRelative(sourceParent, sourceName, accessDelete|fileReadAttributes|syscall.SYNCHRONIZE, fileOpenReparsePoint)
	if err != nil {
		return err
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

	destinationName16 := utf16.Encode([]rune(destinationName))
	if len(destinationName16) > (int(^uint32(0))-20)/2 {
		return errors.New("recovery destination name is too long")
	}
	information := make([]byte, 20+2*len(destinationName16))
	binary.LittleEndian.PutUint64(information[8:16], uint64(destinationDirectory.Fd()))
	binary.LittleEndian.PutUint32(information[16:20], uint32(2*len(destinationName16)))
	for index, character := range destinationName16 {
		binary.LittleEndian.PutUint16(information[20+2*index:], character)
	}
	result, _, callErr := setFileInformationProc.Call(
		sourceFile.Fd(),
		fileRenameInfo,
		uintptr(unsafe.Pointer(&information[0])),
		uintptr(len(information)),
	)
	runtime.KeepAlive(information)
	if result == 0 {
		if callErr != syscall.Errno(0) {
			return callErr
		}
		return errors.New("SetFileInformationByHandle failed without an error code")
	}
	return nil
}
