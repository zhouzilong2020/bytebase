package server

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/bytebase/bytebase/api"
	"github.com/bytebase/bytebase/common"
	vcsPlugin "github.com/bytebase/bytebase/plugin/vcs"
	"github.com/labstack/echo/v4"
)

func (s *Server) registerOAuthRoutes(g *echo.Group) {
	g.POST("/oauth/vcs/:vcsID/exchange-oauth-token", func(c echo.Context) error {
		ctx := context.Background()

		vcsID64, err := strconv.ParseInt(c.Param("vcsID"), 10, 32)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("Failed to marshal oauth provider's ID: %v", c.Param("id"))).SetInternal(err)
		}
		vcsID := int(vcsID64)
		code := c.Request().Header.Get("code")

		findVCS := &api.VCSFind{ID: &vcsID}
		vcs, err := s.VCSService.FindVCS(ctx, findVCS)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, err)
		}
		if vcs == nil {
			return echo.NewHTTPError(http.StatusNotFound, fmt.Sprintf("Failed to find VCS, ID: %v", vcsID)).SetInternal(err)
		}

		oauthToken, err := vcsPlugin.Get(vcs.Type, vcsPlugin.ProviderConfig{Logger: s.l}).ExchangeOAuthToken(
			ctx,
			vcs.InstanceURL,
			common.OAuthExchange{
				ClientID:     vcs.ApplicationID,
				ClientSecret: vcs.Secret,
			},
			code,
			fmt.Sprintf("%s:%d/oauth/callback", s.frontendHost, s.frontendPort),
		)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "Failed to exchange OAuth token").SetInternal(err)
		}

		c.Response().Header().Set(echo.HeaderContentType, echo.MIMEApplicationJSONCharsetUTF8)

		oauthTokenByte, err := json.Marshal(oauthToken)
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "Failed to marshal exchange OAuth token response").SetInternal(err)
		}
		if _, err := c.Response().Write(oauthTokenByte); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "Failed to write exchange OAuth token to the response body").SetInternal(err)
		}

		return nil
	})

}
