import { SNSEvent } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, UpdateCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.TABLE_NAME || "";

export const handler = async (event: SNSEvent) => {
  console.log("Processing status update event");
  
  for (const record of event.Records) {
    try {
      console.log("SNS Record:", JSON.stringify(record.Sns, null, 2));
      
      const messageBody = JSON.parse(record.Sns.Message);
      const imageId = messageBody.id;
      const date = messageBody.date;
      const status = messageBody.update?.status;
      const reason = messageBody.update?.reason;
      
      if (!imageId) {
        console.error("Missing image ID in message");
        continue;
      }
      
      if (!status) {
        console.error("Missing status in message");
        continue;
      }
      
      if (status !== "Pass" && status !== "Reject") {
        console.error(`Invalid status value: ${status}. Must be 'Pass' or 'Reject'`);
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
      
      console.log(`Updating status to '${status}' for image: ${imageId}`);
      
      // Update DynamoDB with the status
      const updateParams = {
        TableName: tableName,
        Key: {
          id: imageId
        },
        UpdateExpression: "SET #status = :status, #reason = :reason, #reviewDate = :date",
        ExpressionAttributeNames: {
          "#status": "status",
          "#reason": "reason",
          "#reviewDate": "reviewDate"
        },
        ExpressionAttributeValues: {
          ":status": status,
          ":reason": reason || "No reason provided",
          ":date": date || new Date().toISOString()
        },
        ReturnValues: "ALL_NEW" as const
      };
      
      const result = await ddbDocClient.send(new UpdateCommand(updateParams));
      console.log(`Successfully updated status to ${status} for image: ${imageId}`);
      console.log("Updated item:", JSON.stringify(result.Attributes, null, 2));
      
      // The status update will trigger email notification through other Lambda
      // This is handled by the SNS -> SQS -> statusMailer chain
      console.log("Status update completed, notification will be sent via the mailer Lambda");
    } catch (error) {
      console.error("Error processing record: ", error);
    }
  }
}; 