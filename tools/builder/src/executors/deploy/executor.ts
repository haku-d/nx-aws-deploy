import { ExecutorContext, logger, runExecutor } from '@nx/devkit';
import * as glob from 'glob';
import { CloudFront } from './cloudfront';
import { getAccessKeyId, getSecretAccessKey } from './config';
import { Schema } from './schema';
import { Uploader } from './uploader';

const getFiles = (filesPath: string) => {
  return glob.sync(`**`, {
    ignore: ['.git'],
    cwd: filesPath,
    nodir: true,
    // Directory and file names may contain `.` at the beginning,
    // e.g. `.well-known/apple-app-site-association`.
    dot: true,
  });
};

const deploy = async (builderConfig: Schema, context: ExecutorContext) => {
  const {
    bucket,
    region,
    subFolder,
    globFileUploadParamsList,
    cfDistributionId,
  } = builderConfig;

  const deployConfig = {
    bucket,
    region,
    subFolder,
    globFileUploadParamsList,
    cfDistributionId,
  } as Pick<
    Schema,
    | 'bucket'
    | 'region'
    | 'subFolder'
    | 'globFileUploadParamsList'
    | 'cfDistributionId'
  >;

  const buildTargetOptions =
    context.projectsConfigurations.projects[context.projectName].targets[
      'build'
    ].options;
  const outputPath = buildTargetOptions.outputPath;

  if (!outputPath) {
    throw new Error('Skip! The output path is not configured.');
  }

  const filePaths = `${context.root}/${outputPath}`;
  const files = getFiles(filePaths);

  if (files.length === 0) {
    throw new Error(
      'Target did not produce any files, or the path is incorrect.'
    );
  }

  if (getAccessKeyId() || getSecretAccessKey()) {
    const uploader = new Uploader(context, deployConfig);
    if (builderConfig.deleteBeforeUpload) {
      logger.info('Start removing files before upload...');
      const success = await uploader.deleteAllFiles();
      if (success) {
        logger.info('✔ Finished removing files...');
      } else {
        return {
          error: `❌  We encounterd an error during the removal of the files`,
          success: false,
        };
      }
    }

    logger.info('Start uploading files...');
    const success = await uploader.upload(files, filePaths);
    if (success) {
      logger.info('✔ Finished uploading files...');

      if (builderConfig.deleteAfterUpload) {
        logger.info('Start removing files after upload...');
        const success = await uploader.deleteStaleFiles(files);
        if (success) {
          logger.info('✔ Finished removing files...');
        } else {
          return {
            error: `❌  Error during files removal`,
            success: false,
          };
        }
      }

      logger.info('Start CloudFront invalidation...');
      const cloudFront = new CloudFront(context, deployConfig);
      const success = await cloudFront.invalidate();
      if (success) {
        logger.info('✔ Finished CloudFront invalidation...');
        return { success: true };
      } else {
        logger.error(`❌  Error during CloudFront invalidation`);
        return {
          error: `❌  Error during CloudFront invalidation`,
          success: false,
        };
      }
    } else {
      return {
        error: `❌  Error during files upload`,
        success: false,
      };
    }
  } else {
    logger.error(`❌  Missing authentication settings for AWS`);
    return {
      error: `❌  Missing authentication settings for AWS`,
      success: false,
    };
  }
};

export default async function deployExecutor(
  builderConfig: Schema,
  context: ExecutorContext
) {
  logger.info('Executing deployment');
  if (!context.target) {
    throw new Error('Cannot deploy the application without a target');
  }

  for await (const buildResult of await runExecutor(
    {
      project: context.projectName,
      target: 'build',
      configuration: 'production',
    },
    {},
    context
  )) {
    if (buildResult.success) {
      return await deploy(builderConfig, context);
    }

    return {
      error: `❌ Application build failed`,
      success: false,
    };
  }
}
