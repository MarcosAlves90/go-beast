package main

import (
	"errors"
	"unicode/utf16"
)

const windowsRenameNameCapacity = 260

// FILE_TRAVERSE | FILE_READ_ATTRIBUTES | SYNCHRONIZE for relative rename resolution.
const windowsRenameRootDirectoryAccess uint32 = 0x00000020 | 0x00000080 | 0x00100000

type windowsFileRenameInfo struct {
	Flags           uint32
	ReplaceIfExists byte
	Padding         [3]byte
	RootDirectory   uintptr
	FileNameLength  uint32
	FileName        [windowsRenameNameCapacity]uint16
}

func buildWindowsFileRenameInfo(destinationName string, rootDirectory uintptr) (windowsFileRenameInfo, error) {
	var info windowsFileRenameInfo
	name16 := utf16.Encode([]rune(destinationName))
	if len(name16) >= len(info.FileName) {
		return info, errors.New("recovery destination name is too long")
	}
	info.RootDirectory = rootDirectory
	info.FileNameLength = uint32(2 * len(name16))
	copy(info.FileName[:], name16)
	return info, nil
}
