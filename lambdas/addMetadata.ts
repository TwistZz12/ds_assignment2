import { SNSEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.TABLE_NAME || "";

export const handler = async (event: SNSEvent) => {
  console.log("Event: ", JSON.stringify(event, null, 2));
  
  for (const record of event.Records) {
    try {
      const messageBody = JSON.parse(record.Sns.Message);
      const imageId = messageBody.id;
      const value = messageBody.value;
      
      // Get metadata type from message attribute
      const metadataType = record.Sns.MessageAttributes.metadata_type?.Value;
      
      if (!metadataType || !["Caption", "Date", "name"].includes(metadataType)) {
        console.error(`Invalid metadata type: ${metadataType}`);
        continue;
      }
      
      // Update DynamoDB with the metadata
      const params = {
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
        }
      };
      
      await ddbDocClient.send(new UpdateCommand(params));
      console.log(`Successfully added ${metadataType} metadata for image: ${imageId}`);
    } catch (error) {
      console.error("Error processing record: ", error);
    }
  }
}; 