package migrations

import (
	"io/fs"
	"testing"
)

func TestEmbeddedMigrationsAreAppendOnlyAndOrdered(t *testing.T) {
	paths, err := fs.Glob(Files, "*.up.sql")
	if err != nil {
		t.Fatalf("Glob() error = %v", err)
	}
	if len(paths) == 0 {
		t.Fatal("no embedded migration files")
	}
	for index, path := range paths {
		if path == "" || (index > 0 && paths[index-1] >= path) {
			t.Fatalf("migration order is not strictly increasing: %v", paths)
		}
	}
}
