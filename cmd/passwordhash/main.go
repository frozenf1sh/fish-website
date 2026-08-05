// passwordhash converts a password from standard input into an Argon2id PHC
// string. It is intentionally stdin-only so operators never place passwords in
// shell history or process arguments.
package main

import (
	"fmt"
	"io"
	"os"

	identitydomain "github.com/frozenfish/fish-website/internal/identity/domain"
)

func main() {
	password, err := io.ReadAll(os.Stdin)
	if err != nil {
		fmt.Fprintln(os.Stderr, "read password:", err)
		os.Exit(1)
	}

	hash, err := identitydomain.HashPassword(string(password))
	if err != nil {
		fmt.Fprintln(os.Stderr, "hash password:", err)
		os.Exit(1)
	}
	fmt.Println(hash)
}
