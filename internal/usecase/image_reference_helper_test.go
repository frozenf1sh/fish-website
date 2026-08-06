package usecase

import (
	"reflect"
	"testing"
)

func TestExtractMarkdownImageURLs(t *testing.T) {
	t.Parallel()

	content := "正文\n![第一张](https://media.example.com/images/one.webp)\n![第二张](https://media.example.com/images/two.webp)\n"
	got := extractMarkdownImageURLs(content)
	want := []string{
		"https://media.example.com/images/one.webp",
		"https://media.example.com/images/two.webp",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("extractMarkdownImageURLs() = %#v, want %#v", got, want)
	}
}

func TestExtractMarkdownImageURLsPreservesDuplicateReferences(t *testing.T) {
	t.Parallel()

	content := "![same](https://media.example.com/images/one.webp)\n![same again](https://media.example.com/images/one.webp)"
	got := extractMarkdownImageURLs(content)
	want := []string{
		"https://media.example.com/images/one.webp",
		"https://media.example.com/images/one.webp",
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("extractMarkdownImageURLs() = %#v, want %#v", got, want)
	}
}
