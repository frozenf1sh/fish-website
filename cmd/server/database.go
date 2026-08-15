package main

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	databaseStartupAttempts = 12
	databaseStartupBackoff  = 2 * time.Second
)

// openPGXPool tolerates the short interval during which PostgreSQL is starting
// or becoming ready during a Kubernetes rollout. The returned pool is closed
// on every failure path so a failed startup does not leak connections.
func openPGXPool(ctx context.Context, dsn string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		return nil, err
	}

	var lastErr error
	for attempt := 0; attempt < databaseStartupAttempts; attempt++ {
		pingCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		err = pool.Ping(pingCtx)
		cancel()
		if err == nil {
			return pool, nil
		}
		lastErr = err

		if attempt == databaseStartupAttempts-1 {
			break
		}

		timer := time.NewTimer(databaseStartupBackoff)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				<-timer.C
			}
			pool.Close()
			return nil, ctx.Err()
		case <-timer.C:
		}
	}

	pool.Close()
	return nil, fmt.Errorf("database unavailable after startup retries: %w", lastErr)
}
