// +build release

package server

import (
	"embed"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"io/fs"
	"net/http"
)

//go:embed dist
var embededFiles embed.FS

//go:embed dist/index.html
var indexContent string

func getFileSystem() http.FileSystem {
	fsys, err := fs.Sub(embededFiles, "dist")
	if err != nil {
		panic(err)
	}

	return http.FS(fsys)
}

func embedFrontend(logger *zap.Logger, e *echo.Echo) {
	// Catch-all route to return index.html, this is to prevent 404 when accessing non-root url.
	// See https://stackoverflow.com/questions/27928372/react-router-urls-dont-work-when-refreshing-or-writing-manually
	e.GET("/*", func(c echo.Context) error {
		return c.HTML(http.StatusOK, indexContent)
	})

	assetHandler := http.FileServer(getFileSystem())
	e.GET("/assets/*", echo.WrapHandler(assetHandler))
}