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
      const date = messageBody.date;
      const status = messageBody.update?.status;
      const reason = messageBody.update?.reason;
      
      if (!imageId || !status) {
        console.error("Missing required fields in message");
        continue;
      }
      
      if (status !== "Pass" && status !== "Reject") {
        console.error(`Invalid status value: ${status}. Must be 'Pass' or 'Reject'`);
        continue;
      }
      
      // Update DynamoDB with the status
      const params = {
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
        }
      };
      
      await ddbDocClient.send(new UpdateCommand(params));
      console.log(`Successfully updated status to ${status} for image: ${imageId}`);
    } catch (error) {
      console.error("Error processing record: ", error);
    }
  }
}; 