## Distributed Systems - Event-Driven Architecture.

__Name:__ MingHao Meng

__Demo__: https://youtu.be/JanHdZTn_2A

This repository contains the implementation of a skeleton design for an application that manages a photo gallery, illustrated below. The app uses an event-driven architecture and is deployed on the AWS platform using the CDK framework for infrastructure provisioning.

![](./images/arch.png)

### Code Status.

__Feature:__
+ Photographer:
  + Log new Images - Completed and Tested
  + Metadata updating - Completed and Tested
  + Invalid image removal - Completed and Tested
  + Status Update Mailer - Completed and Tested
+ Moderator
  + Status updating - Completed and Tested

### Notes (Optional)

The implementation includes:

1. **Image Logging**: Lambda function that validates uploaded images (only JPEG/PNG allowed) and records metadata in DynamoDB.
2. **Metadata Management**: System supports adding different types of metadata (Caption, Date, name) to images through SNS messages.
3. **Invalid File Handling**: Automatic removal of non-image files via SQS Dead Letter Queue processing.
4. **Status Updates**: Moderators can approve/reject images with status and reason information.
5. **Email Notifications**: Photographers receive email notifications when their images' status changes.

The system follows AWS best practices with proper IAM permissions, filtering policies for SNS subscriptions, and error handling throughout.

