package main

import (
	"path/filepath"
	"strings"
)

// defaultExcludedNames are directory or file basenames that are always skipped.
var defaultExcludedNames = map[string]bool{
	"pagefile.sys":              true,
	"swapfile.sys":              true,
	"hiberfil.sys":              true,
	"DumpStack.log.tmp":         true,
	"$RECYCLE.BIN":              true,
	"System Volume Information": true,
	"Recovery":                  true,
	"Config.Msi":                true,
	".Trash-1000":               true,
	"lost+found":                true,
}

// defaultExcludedPrefixes are path substrings that trigger exclusion.
var defaultExcludedPrefixes = []string{
	`\Windows\Temp\`,
	`\Windows\SoftwareDistribution\`,
	`\AppData\Local\Temp\`,
	`\AppData\Local\Microsoft\Windows\INetCache\`,
	"/proc/",
	"/sys/",
	"/dev/",
	"/run/",
	"/tmp/",
}

// ShouldExclude returns true if the given absolute path should be skipped.
func ShouldExclude(absPath string) bool {
	base := filepath.Base(absPath)
	if defaultExcludedNames[base] {
		return true
	}
	for _, prefix := range defaultExcludedPrefixes {
		if strings.Contains(absPath, prefix) {
			return true
		}
	}
	return false
}
