import { SNSEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.TABLE_NAME || "";

export const handler = async (event: SNSEvent) => {
  console.log("Processing metadata update event");
  
  for (const record of event.Records) {
    try {
      console.log("SNS Record:", JSON.stringify(record.Sns, null, 2));
      
      const messageBody = JSON.parse(record.Sns.Message);
      const imageId = messageBody.id;
      const value = messageBody.value;
      
      // Get metadata type from message attribute
      const metadataType = record.Sns.MessageAttributes.metadata_type?.Value;
      
      if (!imageId) {
        console.error("Missing image ID in message");
        continue;
      }
      
      if (!value) {
        console.error("Missing metadata value in message");
        continue;
      }
      
      if (!metadataType || !["Caption", "Date", "name"].includes(metadataType)) {
        console.error(`Invalid metadata type: ${metadataType}`);
        continue;
      }
      
      // Check if the image exists in DynamoDB
      const getParams = {
        TableName: tableName,
        Key: {
          id: imageId
        }
      };
      
      const { Item } = await ddbDocClient.send(new GetCommand(getParams));
      
      if (!Item) {
        console.error(`Image ${imageId} not found in database`);
        continue;
      }
      
      console.log(`Adding ${metadataType} metadata to image: ${imageId}`);
      
      // Update DynamoDB with the metadata
      const updateParams = {
        TableName: tableName,
        Key: {
          id: imageId
        },
        UpdateExpression: `SET #attrName = :attrValue`,
        ExpressionAttributeNames: {
          "#attrName": metadataType.toLowerCase()
        },
        ExpressionAttributeValues: {
          ":attrValue": value
        },
        ReturnValues: "ALL_NEW" as const
      };
      
      const result = await ddbDocClient.send(new UpdateCommand(updateParams));
      console.log(`Successfully added ${metadataType} metadata for image: ${imageId}`);
      console.log("Updated item:", JSON.stringify(result.Attributes, null, 2));
    } catch (error) {
      console.error("Error processing record: ", error);
    }
  }
}; 