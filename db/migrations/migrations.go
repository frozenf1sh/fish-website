// Package migrations owns the append-only PostgreSQL schema history.
package migrations

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"sort"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Files contains only append-only migration files. Do not modify a migration
// after it has been applied to any shared environment.
//
//go:embed *.up.sql
var Files embed.FS

// Apply executes unapplied migrations inside one database transaction and
// records their file names. The current migration set contains only
// transactional DDL; future non-transactional migrations need an explicit,
// separately reviewed execution path.
func Apply(ctx context.Context, pool *pgxpool.Pool) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin migration transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if _, err := tx.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS fish_website_schema_migrations (
			version TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`); err != nil {
		return fmt.Errorf("create migration ledger: %w", err)
	}

	paths, err := fs.Glob(Files, "*.up.sql")
	if err != nil {
		return fmt.Errorf("list migration files: %w", err)
	}
	sort.Strings(paths)
	for _, path := range paths {
		var applied bool
		if err := tx.QueryRow(ctx,
			`SELECT EXISTS (SELECT 1 FROM fish_website_schema_migrations WHERE version = $1)`,
			path,
		).Scan(&applied); err != nil {
			return fmt.Errorf("check migration %s: %w", path, err)
		}
		if applied {
			continue
		}

		migration, err := Files.ReadFile(path)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", path, err)
		}
		if _, err := tx.Exec(ctx, string(migration)); err != nil {
			return fmt.Errorf("apply migration %s: %w", path, err)
		}
		if _, err := tx.Exec(ctx,
			`INSERT INTO fish_website_schema_migrations (version) VALUES ($1)`,
			path,
		); err != nil {
			return fmt.Errorf("record migration %s: %w", path, err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit migrations: %w", err)
	}
	return nil
}
