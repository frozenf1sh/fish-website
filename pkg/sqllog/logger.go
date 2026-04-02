package sqllog

import (
	"context"
	"fmt"
	"time"

	"github.com/frozenfish/fish-website/pkg/logger"
)

// LogQuery logs a SQL query
func LogQuery(ctx context.Context, sql string, args []any, elapsed time.Duration, err error) {
	attrs := []any{
		logger.String("duration", elapsed.String()),
		logger.String("sql", sql),
	}

	if len(args) > 0 {
		attrs = append(attrs, logger.Any("args", args))
	}

	if err != nil {
		attrs = append(attrs, logger.Err(err))
		logger.ErrorContext(ctx, "database query error", attrs...)
	} else {
		logger.DebugContext(ctx, "database query", attrs...)
	}
}

// LogSlowQuery logs a slow SQL query
func LogSlowQuery(ctx context.Context, sql string, args []any, elapsed time.Duration, threshold time.Duration) {
	attrs := []any{
		logger.String("duration", elapsed.String()),
		logger.String("sql", sql),
		logger.String("threshold", threshold.String()),
	}

	if len(args) > 0 {
		attrs = append(attrs, logger.Any("args", args))
	}

	logger.WarnContext(ctx, "slow database query", attrs...)
}

// LogExec logs a SQL exec operation
func LogExec(ctx context.Context, sql string, args []any, elapsed time.Duration, rowsAffected int64, err error) {
	attrs := []any{
		logger.String("duration", elapsed.String()),
		logger.String("sql", sql),
		logger.Int64("rows_affected", rowsAffected),
	}

	if len(args) > 0 {
		attrs = append(attrs, logger.Any("args", args))
	}

	if err != nil {
		attrs = append(attrs, logger.Err(err))
		logger.ErrorContext(ctx, "database exec error", attrs...)
	} else {
		logger.DebugContext(ctx, "database exec", attrs...)
	}
}

// LogTxBegin logs transaction begin
func LogTxBegin(ctx context.Context) {
	logger.DebugContext(ctx, "begin transaction")
}

// LogTxCommit logs transaction commit
func LogTxCommit(ctx context.Context, elapsed time.Duration) {
	logger.DebugContext(ctx, "commit transaction", logger.String("duration", elapsed.String()))
}

// LogTxRollback logs transaction rollback
func LogTxRollback(ctx context.Context, err error) {
	if err != nil {
		logger.WarnContext(ctx, "rollback transaction", logger.Err(err))
	} else {
		logger.DebugContext(ctx, "rollback transaction")
	}
}

// ArgsToString converts args to a string for logging
func ArgsToString(args []any) string {
	if len(args) == 0 {
		return ""
	}
	var result string
	for i, arg := range args {
		if i > 0 {
			result += ", "
		}
		result += fmt.Sprintf("%v", arg)
	}
	return result
}
