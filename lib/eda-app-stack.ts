import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

    const imageTable = new dynamodb.Table(this, "ImageTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const imageProcessDLQ = new sqs.Queue(this, "img-process-dlq", {
      receiveMessageWaitTime: cdk.Duration.seconds(5),
    });

    const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(5),
      deadLetterQueue: {
        queue: imageProcessDLQ,
        maxReceiveCount: 3,
      },
    });

    const mailerQueue = new sqs.Queue(this, "mailer-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(10),
    });

    const galleryTopic = new sns.Topic(this, "GalleryTopic", {
      displayName: "Photo Gallery Events",
    });

    const logImageFn = new lambdanode.NodejsFunction(
      this,
      "LogImageFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: `${__dirname}/../lambdas/logImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName,
          BUCKET_NAME: imagesBucket.bucketName,
        },
      }
    );

    const removeImageFn = new lambdanode.NodejsFunction(
      this,
      "RemoveImageFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: `${__dirname}/../lambdas/removeImage.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          BUCKET_NAME: imagesBucket.bucketName,
        },
      }
    );

    const addMetadataFn = new lambdanode.NodejsFunction(
      this,
      "AddMetadataFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: `${__dirname}/../lambdas/addMetadata.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName,
        },
      }
    );

    const updateStatusFn = new lambdanode.NodejsFunction(
      this,
      "UpdateStatusFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: `${__dirname}/../lambdas/updateStatus.ts`,
        timeout: cdk.Duration.seconds(15),
        memorySize: 128,
        environment: {
          TABLE_NAME: imageTable.tableName,
        },
      }
    );

    const mailerFn = new lambdanode.NodejsFunction(
      this,
      "StatusMailerFunction",
      {
        runtime: lambda.Runtime.NODEJS_20_X,
        memorySize: 256,
        timeout: cdk.Duration.seconds(10),
        entry: `${__dirname}/../lambdas/statusMailer.ts`,
        environment: {
          TABLE_NAME: imageTable.tableName,
        },
      }
    );

    imagesBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.SnsDestination(galleryTopic)
    );

    galleryTopic.addSubscription(
      new subs.SqsSubscription(imageProcessQueue, {
        filterPolicy: {
          eventType: sns.SubscriptionFilter.stringFilter({
            allowlist: ["ObjectCreated:Put", "ObjectCreated:Post"],
          }),
        },
      })
    );

    galleryTopic.addSubscription(
      new subs.LambdaSubscription(addMetadataFn, {
        filterPolicy: {
          "metadata_type": sns.SubscriptionFilter.stringFilter({
            allowlist: ["Caption", "Date", "name"],
          }),
        },
      })
    );

    galleryTopic.addSubscription(
      new subs.LambdaSubscription(updateStatusFn, {
        filterPolicy: {
          "MessageAttributes.update": sns.SubscriptionFilter.existsFilter(),
        },
      })
    );

    logImageFn.addEventSource(
      new events.SqsEventSource(imageProcessQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    removeImageFn.addEventSource(
      new events.SqsEventSource(imageProcessDLQ, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    mailerFn.addEventSource(
      new events.SqsEventSource(mailerQueue, {
        batchSize: 5,
        maxBatchingWindow: cdk.Duration.seconds(5),
      })
    );

    galleryTopic.addSubscription(
      new subs.SqsSubscription(mailerQueue, {
        filterPolicy: {
          "MessageAttributes.status": sns.SubscriptionFilter.stringFilter({
            allowlist: ["Pass", "Reject"],
          }),
        },
      })
    );

    imagesBucket.grantRead(logImageFn);
    imagesBucket.grantReadWrite(removeImageFn);
    imageTable.grantReadWriteData(logImageFn);
    imageTable.grantReadWriteData(addMetadataFn);
    imageTable.grantReadWriteData(updateStatusFn);
    imageTable.grantReadData(mailerFn);

    mailerFn.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "ses:SendEmail",
          "ses:SendRawEmail",
          "ses:SendTemplatedEmail",
        ],
        resources: ["*"],
      })
    );

    new cdk.CfnOutput(this, "BucketName", {
      value: imagesBucket.bucketName,
    });

    new cdk.CfnOutput(this, "TableName", {
      value: imageTable.tableName,
    });

    new cdk.CfnOutput(this, "TopicArn", {
      value: galleryTopic.topicArn,
    });
  }
}
