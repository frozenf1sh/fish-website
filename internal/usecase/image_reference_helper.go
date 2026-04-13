package usecase

import (
	"encoding/json"
	"regexp"
)

var markdownImageURLRegex = regexp.MustCompile(`!\[[^\]]*\]\(([^)]+)\)`)

func extractMarkdownImageURLs(content string) []string {
	matches := markdownImageURLRegex.FindAllStringSubmatch(content, -1)
	if len(matches) == 0 {
		return nil
	}
	urls := make([]string, 0, len(matches))
	for _, m := range matches {
		if len(m) > 1 && m[1] != "" {
			urls = append(urls, m[1])
		}
	}
	return urls
}

func diffURLCounts(oldURLs, newURLs []string) (added []string, removed []string) {
	oldCount := make(map[string]int, len(oldURLs))
	newCount := make(map[string]int, len(newURLs))

	for _, u := range oldURLs {
		if u != "" {
			oldCount[u]++
		}
	}
	for _, u := range newURLs {
		if u != "" {
			newCount[u]++
		}
	}

	for u, c := range newCount {
		if oldCount[u] >= c {
			continue
		}
		for i := 0; i < c-oldCount[u]; i++ {
			added = append(added, u)
		}
	}
	for u, c := range oldCount {
		if newCount[u] >= c {
			continue
		}
		for i := 0; i < c-newCount[u]; i++ {
			removed = append(removed, u)
		}
	}

	return added, removed
}

func extractCustomLinkURL(raw, key string) string {
	if raw == "" || key == "" {
		return ""
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(raw), &payload); err != nil {
		return ""
	}
	v, ok := payload[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return s
}
