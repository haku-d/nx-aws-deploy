import { GlobFileUploadParamsList, Schema } from './schema';

const getEnv = (key: string): string => {
  return process.env[key] ?? '';
};

export const getAccessKeyId = (): string => {
  return getEnv('NG_DEPLOY_AWS_ACCESS_KEY_ID') || getEnv('AWS_ACCESS_KEY_ID');
};

export const getSecretAccessKey = (): string => {
  return (
    getEnv('NG_DEPLOY_AWS_SECRET_ACCESS_KEY') || getEnv('AWS_SECRET_ACCESS_KEY')
  );
};

export const getSessionToken = (): string => {
  return getEnv('NG_DEPLOY_AWS_SESSION_TOKEN') || getEnv('AWS_SESSION_TOKEN');
};

export const getBucket = (builderConfig: Schema): string => {
  return getEnv('NG_DEPLOY_AWS_BUCKET') || (builderConfig.bucket as string);
};

export const getRegion = (builderConfig: Schema): string => {
  return (
    (getEnv('NG_DEPLOY_AWS_REGION') ||
      (builderConfig.region as string) ||
      getEnv('AWS_DEFAULT_REGION')) ??
    ''
  );
};

export const getSubFolder = (builderConfig: Schema): string => {
  return (
    getEnv('NG_DEPLOY_AWS_SUB_FOLDER') || (builderConfig.subFolder as string)
  );
};

export const getCfDistributionId = (builderConfig: Schema): string => {
  return (
    getEnv('NG_DEPLOY_AWS_CF_DISTRIBUTION_ID') ||
    (builderConfig.cfDistributionId as string)
  );
};

export const gets3ForcePathStyle = (): boolean => {
  return getEnv('AWS_USE_PATH_STYLE_ENDPOINT') === 'true';
};

export const getAwsEndpoint = (): string => {
  return getEnv('AWS_ENDPOINT') ?? '';
};

const validateGlobFileUploadParamsList = (
  paramsList: GlobFileUploadParamsList,
) => Array.isArray(paramsList) && !paramsList.some((params) => !params.glob);

export const getGlobFileUploadParamsList = (
  builderConfig: Schema,
): GlobFileUploadParamsList => {
  let globFileUploadParamsList = [];
  try {
    globFileUploadParamsList = getEnv(
      'NG_DEPLOY_AWS_GLOB_FILE_UPLOAD_PARAMS_LIST',
    )
      ? JSON.parse(getEnv('NG_DEPLOY_AWS_GLOB_FILE_UPLOAD_PARAMS_LIST'))
      : builderConfig.globFileUploadParamsList || [];
  } catch (e) {
    console.error(
      'Invalid JSON for NG_DEPLOY_AWS_GLOB_FILE_UPLOAD_PARAMS_LIST',
      e,
    );
  }

  return validateGlobFileUploadParamsList(globFileUploadParamsList)
    ? globFileUploadParamsList
    : [];
};
