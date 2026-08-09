package github

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	apiBaseURL = "https://api.github.com"
	graphqlURL = "https://api.github.com/graphql"
)

type Client struct {
	httpClient *http.Client
	username   string
	token      string
}

type Activity struct {
	Username                      string
	ProfileURL                    string
	AvatarURL                     string
	DisplayName                   string
	Bio                           string
	PublicRepositories            int32
	Followers                     int32
	Following                     int32
	TotalContributions            int32
	Weeks                         []ContributionWeek
	ContributionCalendarAvailable bool
	LastUpdatedAt                 time.Time
}

type ContributionWeek struct {
	Days []ContributionDay
}

type ContributionDay struct {
	Date              string
	ContributionCount int32
	Color             string
}

type userResponse struct {
	Login       string `json:"login"`
	HTMLURL     string `json:"html_url"`
	AvatarURL   string `json:"avatar_url"`
	Name        string `json:"name"`
	Bio         string `json:"bio"`
	PublicRepos int32  `json:"public_repos"`
	Followers   int32  `json:"followers"`
	Following   int32  `json:"following"`
}

type graphqlResponse struct {
	Data struct {
		User *struct {
			ContributionsCollection struct {
				ContributionCalendar struct {
					TotalContributions int32 `json:"totalContributions"`
					Weeks              []struct {
						ContributionDays []struct {
							Date              string `json:"date"`
							ContributionCount int32  `json:"contributionCount"`
							Color             string `json:"color"`
						} `json:"contributionDays"`
					} `json:"weeks"`
				} `json:"contributionCalendar"`
			} `json:"contributionsCollection"`
		} `json:"user"`
	} `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

func NewClient(username, token string) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		username:   strings.TrimSpace(username),
		token:      strings.TrimSpace(token),
	}
}

func (c *Client) Fetch(ctx context.Context) (*Activity, error) {
	profile, err := c.fetchProfile(ctx)
	if err != nil {
		return nil, err
	}

	activity := &Activity{
		Username:           profile.Login,
		ProfileURL:         profile.HTMLURL,
		AvatarURL:          profile.AvatarURL,
		DisplayName:        profile.Name,
		Bio:                profile.Bio,
		PublicRepositories: profile.PublicRepos,
		Followers:          profile.Followers,
		Following:          profile.Following,
		LastUpdatedAt:      time.Now().UTC(),
	}

	if c.token == "" {
		return activity, nil
	}

	calendar, err := c.fetchCalendar(ctx)
	if err != nil {
		// Profile data remains useful when the optional GraphQL token is missing
		// or temporarily unavailable. The UI can render a configuration hint.
		return activity, nil
	}
	activity.TotalContributions = calendar.TotalContributions
	activity.Weeks = calendar.Weeks
	activity.ContributionCalendarAvailable = true
	return activity, nil
}

func (c *Client) fetchProfile(ctx context.Context) (*userResponse, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, apiBaseURL+"/users/"+c.username, nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github profile request returned %s", response.Status)
	}
	var profile userResponse
	if err := json.NewDecoder(response.Body).Decode(&profile); err != nil {
		return nil, err
	}
	return &profile, nil
}

type calendarResponse struct {
	TotalContributions int32
	Weeks              []ContributionWeek
}

func (c *Client) fetchCalendar(ctx context.Context) (*calendarResponse, error) {
	requestBody := struct {
		Query     string                 `json:"query"`
		Variables map[string]interface{} `json:"variables"`
	}{
		Query: `query($login: String!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount color }
        }
      }
    }
  }
}`,
		Variables: map[string]interface{}{"login": c.username},
	}
	body, err := json.Marshal(requestBody)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, graphqlURL, strings.NewReader(string(body)))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Authorization", "Bearer "+c.token)
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	response, err := c.httpClient.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github graphql request returned %s", response.Status)
	}
	var decoded graphqlResponse
	if err := json.NewDecoder(response.Body).Decode(&decoded); err != nil {
		return nil, err
	}
	if len(decoded.Errors) > 0 || decoded.Data.User == nil {
		return nil, fmt.Errorf("github contribution calendar unavailable")
	}

	calendar := decoded.Data.User.ContributionsCollection.ContributionCalendar
	result := &calendarResponse{TotalContributions: calendar.TotalContributions, Weeks: make([]ContributionWeek, 0, len(calendar.Weeks))}
	for _, week := range calendar.Weeks {
		item := ContributionWeek{Days: make([]ContributionDay, 0, len(week.ContributionDays))}
		for _, day := range week.ContributionDays {
			item.Days = append(item.Days, ContributionDay{Date: day.Date, ContributionCount: day.ContributionCount, Color: day.Color})
		}
		result.Weeks = append(result.Weeks, item)
	}
	return result, nil
}
