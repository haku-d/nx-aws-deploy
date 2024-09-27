import {
  CloudFrontClient,
  CreateInvalidationCommand,
  CreateInvalidationRequest,
} from '@aws-sdk/client-cloudfront';
import { ExecutorContext, logger } from '@nx/devkit';
import {
  getAccessKeyId,
  getCfDistributionId,
  getRegion,
  getSecretAccessKey,
  getSubFolder,
} from './config';
import { Schema } from './schema';

export class CloudFront {
  private _builderConfig: Schema;
  private _context: ExecutorContext;

  private _cloudFront: CloudFrontClient;

  private _cfDistributionId: string;
  private _subFolder: string;
  private _region: string;

  constructor(context: ExecutorContext, builderConfig: Schema) {
    this._context = context;
    this._builderConfig = builderConfig;

    this._region = getRegion(this._builderConfig);
    this._cfDistributionId = getCfDistributionId(this._builderConfig);
    this._subFolder = getSubFolder(this._builderConfig);

    this._cloudFront = new CloudFrontClient({
      region: this._region,
      apiVersion: 'latest',
      credentials: {
        secretAccessKey: getSecretAccessKey(),
        accessKeyId: getAccessKeyId(),
      },
    });
  }

  public async invalidate(): Promise<boolean> {
    if (!this._cfDistributionId) {
      logger.info('⚠️  Skipping invalidation of CloudFront distribution');
      return true;
    }

    const cf_path = this._subFolder ? `/${this._subFolder}/*` : '/*';
    const reference = `ngx-aws-deploy-${new Date().getTime()}`;

    const params: CreateInvalidationRequest = {
      DistributionId: this._cfDistributionId,
      InvalidationBatch: {
        CallerReference: reference,
        Paths: {
          Quantity: 1,
          Items: [cf_path],
        },
      },
    };

    logger.info(
      `Triggering invalidation of '${cf_path}' from CloudFront distribution ${this._cfDistributionId}`,
    );

    await this._cloudFront
      .send(new CreateInvalidationCommand(params))
      .then((data) => {
        logger.info(
          `Successfully triggered invalidation of '${cf_path}' from CloudFront distribution ${this._cfDistributionId}: current status is '${data.Invalidation?.Status}'`,
        );
      })
      .catch((error) => {
        logger.error(
          `❌  The following error was found during CloudFront invalidation ${error}`,
        );
        throw error;
      });

    return true;
  }
}
