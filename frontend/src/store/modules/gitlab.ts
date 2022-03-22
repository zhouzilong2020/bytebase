import axios from "axios";
import {
  ExternalRepositoryInfo,
  VCS,
  OAuthConfig,
  OAuthToken,
} from "../../types";

const getters = {};

function convertGitLabProject(project: any): ExternalRepositoryInfo {
  return {
    externalId: project.id.toString(),
    name: project.name,
    fullPath: project.path_with_namespace,
    webUrl: project.web_url,
  };
}

const actions = {
  // this actions is for initiating vcs ONLY
  // after creation, the frontend should in no case access the secret
  async exchangeToken(
    {}: any,
    {
      oAuthConfig,
      code,
    }: {
      oAuthConfig: OAuthConfig;
      code: string;
    }
  ): Promise<OAuthToken> {
    const data = (
      await axios.post(
        `${oAuthConfig.endpoint}?client_id=${oAuthConfig.applicationId}&client_secret=${oAuthConfig.secret}&code=${code}&redirect_uri=${oAuthConfig.redirectUrl}&grant_type=authorization_code`
      )
    ).data;

    const oAuthToken: OAuthToken = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      // For GitLab, as of 13.12, the default config won't expire the access token, thus this field is 0.
      // see https://gitlab.com/gitlab-org/gitlab/-/issues/21745.
      expiresTs: data.expires_in == 0 ? 0 : data.created_at + data.expires_in,
    };
    return oAuthToken;
  },

  // TODO(zilong): here we still store the access token at the frontend, we may move this to the backend
  async fetchProjectList(
    {}: any,
    { vcs, token }: { vcs: VCS; token: OAuthToken }
  ): Promise<ExternalRepositoryInfo[]> {
    console.log("token", token);
    const data = (
      await axios.get(`/api/vcs/${vcs.id}/external-repository`, {
        headers: {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken,
        },
      })
    ).data;

    return data.map((item: any) => convertGitLabProject(item));
  },
};

const mutations = {};

export default {
  namespaced: true,
  getters,
  actions,
  mutations,
};
