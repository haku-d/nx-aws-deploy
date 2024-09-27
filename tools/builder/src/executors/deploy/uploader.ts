import {
  DeleteObjectsCommand,
  HeadBucketCommand,
  HeadBucketCommandInput,
  ListObjectsCommand,
  ObjectIdentifier,
  PutObjectCommand,
  PutObjectCommandInput,
  S3Client,
} from '@aws-sdk/client-s3';
import { ExecutorContext, logger } from '@nx/devkit';
import * as fs from 'fs';
import * as mimeTypes from 'mime-types';
import { minimatch } from 'minimatch';
import * as path from 'path';
import {
  getAccessKeyId,
  getBucket,
  getGlobFileUploadParamsList,
  getRegion,
  getSecretAccessKey,
  getSubFolder,
} from './config';
import {
  GlobFileUploadParams,
  GlobFileUploadParamsList,
  Schema,
} from './schema';

export class Uploader {
  private _context: ExecutorContext;
  private _s3: S3Client;
  private _bucket: string;
  private _region: string;
  private _subFolder: string;
  private _builderConfig: Schema;
  private _globFileUploadParamsList: GlobFileUploadParamsList;

  constructor(context: ExecutorContext, builderConfig: Schema) {
    this._context = context;
    this._builderConfig = builderConfig;
    this._bucket = getBucket(this._builderConfig);
    this._region = getRegion(this._builderConfig);
    this._subFolder = getSubFolder(this._builderConfig);
    this._globFileUploadParamsList = getGlobFileUploadParamsList(
      this._builderConfig,
    );
    this._s3 = new S3Client({
      region: this._region,
      apiVersion: 'latest',
      credentials: {
        secretAccessKey: getSecretAccessKey(),
        accessKeyId: getAccessKeyId(),
      },
    });
  }

  async upload(files: string[], filesPath: string): Promise<boolean> {
    try {
      if (!this._region || !this._bucket) {
        logger.error(
          `❌  Looks like you are missing some upload configuration (need region, bucket)`,
        );
        return false;
      }

      const params: HeadBucketCommandInput = {
        Bucket: this._bucket,
      };

      await this._s3
        .send(new HeadBucketCommand(params))
        .then(() => {
          return this.uploadFiles(files, filesPath);
        })
        .catch((error) => {
          logger.error(
            `❌  The following error was found during the upload ${error}`,
          );
          throw error;
        });
    } catch {
      return false;
    }
    return true;
  }

  uploadFiles(files: string[], filesPath: string) {
    return Promise.all(
      files.map(async (file) => {
        await this.uploadFile(path.join(filesPath, file), file);
      }),
    );
  }

  public async uploadFile(localFilePath: string, originFilePath: string) {
    originFilePath = originFilePath.replace(/\\/g, '/');
    const fileName = path.basename(localFilePath);
    const globFileUploadParamsForFile = this._globFileUploadParamsList.filter(
      (params: GlobFileUploadParams) => minimatch(originFilePath, params.glob),
    );

    const mergedParamsForFile = globFileUploadParamsForFile.reduce(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (acc, { glob, ...params }) => ({
        ...acc,
        ...params,
      }),
      {},
    );

    const body = fs.createReadStream(localFilePath);
    body.on('error', function (err) {
      console.log('File Error', err);
    });

    const params: PutObjectCommandInput = {
      Bucket: this._bucket,
      Key: this._subFolder
        ? `${this._subFolder}/${originFilePath}`
        : originFilePath,
      Body: body,
      ContentType: mimeTypes.lookup(fileName) || undefined,
      ...mergedParamsForFile,
    };

    await this._s3
      .send(new PutObjectCommand(params))
      .then(() =>
        logger.info(`Uploaded file "${params.Key}" to ${params.Bucket}`),
      )
      .catch((item) => {
        logger.error(`Error uploading file: ${item}`);
        throw item;
      });
  }

  public async deleteStaleFiles(localFiles: string[]) {
    const remoteFiles = await this.listObjectKeys();
    const staleFiles = this._subFolder
      ? localFiles.map((file) => `${this._subFolder}/${file}`)
      : localFiles;
    const filesToDelete = remoteFiles.filter(
      (file) => file.Key && !staleFiles.includes(file.Key),
    );

    return this.deleteFiles(filesToDelete);
  }

  public async deleteAllFiles() {
    const remoteFiles = await this.listObjectKeys();

    return this.deleteFiles(remoteFiles);
  }

  private async listObjectKeys() {
    const params = {
      Bucket: this._bucket,
      Prefix: this._subFolder,
    };

    try {
      const data = await this._s3.send(new ListObjectsCommand(params));
      return data.Contents?.map((item) => ({
        Key: item.Key,
      })) as ObjectIdentifier[];
    } catch (err) {
      logger.error(`Error listing files: ${err}`);
    }

    return [];
  }

  private async deleteFiles(objects: ObjectIdentifier[]) {
    if (!objects.length) {
      logger.info('⚠️  No files to delete');
      return true;
    }

    const params = {
      Bucket: this._bucket,
      Delete: {
        Objects: objects,
      },
    };

    try {
      // return this._s3.deleteObjects(params).promise();
      return this._s3.send(new DeleteObjectsCommand(params));
    } catch (err) {
      logger.error(`Error deleting file: ${err}`);
    }
  }
}
