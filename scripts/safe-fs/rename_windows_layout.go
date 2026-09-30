package main

import (
	"errors"
	"unicode/utf16"
)

const windowsRenameNameCapacity = 260

const (
	windowsFileRenameInformationClass   uint32 = 10
	windowsFileRenameInformationExClass uint32 = 65
)

// FILE_TRAVERSE | FILE_READ_ATTRIBUTES | SYNCHRONIZE for relative rename resolution.
const windowsRenameRootDirectoryAccess uint32 = 0x00000020 | 0x00000080 | 0x00100000

type windowsNtRenameInformation struct {
	ReplaceIfExists byte
	Padding         [7]byte
	RootDirectory   uintptr
	FileNameLength  uint32
	FileName        [windowsRenameNameCapacity]uint16
}

type windowsNtRenameInformationEx struct {
	Flags          uint32
	Padding        [4]byte
	RootDirectory  uintptr
	FileNameLength uint32
	FileName       [windowsRenameNameCapacity]uint16
}

func encodeWindowsRenameName(destinationName string, capacity int) ([]uint16, error) {
	name16 := utf16.Encode([]rune(destinationName))
	if len(name16) == 0 || len(name16) >= capacity {
		return nil, errors.New("recovery destination name is too long")
	}
	return name16, nil
}

func buildWindowsNtRenameInformation(destinationName string, rootDirectory uintptr) (windowsNtRenameInformation, error) {
	var info windowsNtRenameInformation
	name16, err := encodeWindowsRenameName(destinationName, len(info.FileName))
	if err != nil {
		return info, err
	}
	info.ReplaceIfExists = 0
	info.RootDirectory = rootDirectory
	info.FileNameLength = uint32(2 * len(name16))
	copy(info.FileName[:], name16)
	return info, nil
}

func buildWindowsNtRenameInformationEx(destinationName string, rootDirectory uintptr) (windowsNtRenameInformationEx, error) {
	var info windowsNtRenameInformationEx
	name16, err := encodeWindowsRenameName(destinationName, len(info.FileName))
	if err != nil {
		return info, err
	}
	info.Flags = 0
	info.RootDirectory = rootDirectory
	info.FileNameLength = uint32(2 * len(name16))
	copy(info.FileName[:], name16)
	return info, nil
}
