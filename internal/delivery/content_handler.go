package delivery

import (
	"context"

	"connectrpc.com/connect"
	homev1 "github.com/frozenfish/fish-website/gen/go/home/v1"
	"github.com/frozenfish/fish-website/internal/domain"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func (h *Handler) ListProjects(ctx context.Context, _ *connect.Request[homev1.ListProjectsRequest]) (*connect.Response[homev1.ListProjectsResponse], error) {
	projects, err := h.projectUsecase.List(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	result := make([]*homev1.Project, 0, len(projects))
	for _, project := range projects {
		result = append(result, toProtoProject(project))
	}
	return connect.NewResponse(&homev1.ListProjectsResponse{Projects: result}), nil
}

func (h *Handler) GetProject(ctx context.Context, req *connect.Request[homev1.GetProjectRequest]) (*connect.Response[homev1.GetProjectResponse], error) {
	project, err := h.projectUsecase.Get(ctx, req.Msg.Id)
	if err != nil {
		return nil, connect.NewError(connect.CodeNotFound, err)
	}
	return connect.NewResponse(&homev1.GetProjectResponse{Project: toProtoProject(project)}), nil
}

func (h *Handler) CreateProject(ctx context.Context, req *connect.Request[homev1.CreateProjectRequest]) (*connect.Response[homev1.CreateProjectResponse], error) {
	project, err := h.projectUsecase.Create(ctx, req.Msg.Title, req.Msg.Summary, req.Msg.LinkUrl, req.Msg.CoverImageId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&homev1.CreateProjectResponse{Project: toProtoProject(project)}), nil
}

func (h *Handler) UpdateProject(ctx context.Context, req *connect.Request[homev1.UpdateProjectRequest]) (*connect.Response[homev1.UpdateProjectResponse], error) {
	project, err := h.projectUsecase.Update(ctx, req.Msg.Id, req.Msg.Title, req.Msg.Summary, req.Msg.LinkUrl, req.Msg.CoverImageId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&homev1.UpdateProjectResponse{Project: toProtoProject(project)}), nil
}

func (h *Handler) DeleteProject(ctx context.Context, req *connect.Request[homev1.DeleteProjectRequest]) (*connect.Response[homev1.DeleteProjectResponse], error) {
	if err := h.projectUsecase.Delete(ctx, req.Msg.Id); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&homev1.DeleteProjectResponse{}), nil
}

func (h *Handler) ReorderProjects(ctx context.Context, req *connect.Request[homev1.ReorderProjectsRequest]) (*connect.Response[homev1.ReorderProjectsResponse], error) {
	if err := h.projectUsecase.Reorder(ctx, req.Msg.ProjectIds); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&homev1.ReorderProjectsResponse{}), nil
}

func (h *Handler) GetAbout(ctx context.Context, _ *connect.Request[homev1.GetAboutRequest]) (*connect.Response[homev1.GetAboutResponse], error) {
	settings, err := h.settingsUsecase.GetSettings(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	images, err := h.aboutUsecase.ListImages(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	featuredArticleID, err := h.aboutUsecase.GetFeaturedArticleID(ctx)
	if err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	result := make([]*homev1.AboutImage, 0, len(images))
	for _, image := range images {
		result = append(result, toProtoAboutImage(image))
	}
	return connect.NewResponse(&homev1.GetAboutResponse{Settings: toProtoSettings(settings), Images: result, FeaturedArticleId: featuredArticleID}), nil
}

func (h *Handler) UpdateAbout(ctx context.Context, req *connect.Request[homev1.UpdateAboutRequest]) (*connect.Response[homev1.UpdateAboutResponse], error) {
	if err := h.aboutUsecase.SetFeaturedArticleID(ctx, req.Msg.FeaturedArticleId); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&homev1.UpdateAboutResponse{FeaturedArticleId: req.Msg.FeaturedArticleId}), nil
}

func (h *Handler) AddAboutImage(ctx context.Context, req *connect.Request[homev1.AddAboutImageRequest]) (*connect.Response[homev1.AddAboutImageResponse], error) {
	image, err := h.aboutUsecase.AddImage(ctx, req.Msg.ImageId)
	if err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&homev1.AddAboutImageResponse{Image: toProtoAboutImage(image)}), nil
}

func (h *Handler) RemoveAboutImage(ctx context.Context, req *connect.Request[homev1.RemoveAboutImageRequest]) (*connect.Response[homev1.RemoveAboutImageResponse], error) {
	if err := h.aboutUsecase.RemoveImage(ctx, req.Msg.Id); err != nil {
		return nil, connect.NewError(connect.CodeInternal, err)
	}
	return connect.NewResponse(&homev1.RemoveAboutImageResponse{}), nil
}

func (h *Handler) ReorderAboutImages(ctx context.Context, req *connect.Request[homev1.ReorderAboutImagesRequest]) (*connect.Response[homev1.ReorderAboutImagesResponse], error) {
	if err := h.aboutUsecase.Reorder(ctx, req.Msg.ImageIds); err != nil {
		return nil, connect.NewError(connect.CodeInvalidArgument, err)
	}
	return connect.NewResponse(&homev1.ReorderAboutImagesResponse{}), nil
}

func toProtoProject(project *domain.Project) *homev1.Project {
	result := &homev1.Project{Id: project.ID, Title: project.Title, Summary: project.Summary, LinkUrl: project.LinkURL, SortOrder: int32(project.SortOrder), CreatedAt: timestamppb.New(project.CreatedAt), UpdatedAt: timestamppb.New(project.UpdatedAt)}
	if project.CoverImage != nil {
		result.CoverImage = toProtoImage(project.CoverImage)
	}
	return result
}

func toProtoAboutImage(image *domain.AboutImage) *homev1.AboutImage {
	result := &homev1.AboutImage{Id: image.ID, SortOrder: int32(image.SortOrder)}
	if image.Image != nil {
		result.Image = toProtoImage(image.Image)
	}
	return result
}
