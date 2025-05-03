import { SQSEvent } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const sesClient = new SESClient({});
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.TABLE_NAME || "";
const senderEmail = "noreply@example.com"; // Update with verified SES email

export const handler = async (event: SQSEvent) => {
  console.log("Event: ", JSON.stringify(event, null, 2));
  
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const message = JSON.parse(body.Message);
      
      const imageId = message.id;
      const status = message.update?.status;
      
      if (!imageId || !status) {
        console.error("Missing required fields in message");
        continue;
      }
      
      // Retrieve image details from DynamoDB to get photographer's email
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
      
      const photographerName = Item.name || "Photographer";
      const photographerEmail = Item.email || "photographer@example.com"; // In a real app, this would be required
      
      // Send email notification
      const emailParams = {
        Destination: {
          ToAddresses: [photographerEmail]
        },
        Message: {
          Body: {
            Text: {
              Data: `Dear ${photographerName},
              
Your image "${imageId}" has been reviewed and has been ${status === "Pass" ? "APPROVED" : "REJECTED"}.

${status === "Reject" ? `Reason: ${message.update.reason || "No reason provided"}` : ""}

Thank you for your submission.

Photo Gallery Team`
            }
          },
          Subject: {
            Data: `Photo Review Status: ${status === "Pass" ? "Approved" : "Rejected"} - ${imageId}`
          }
        },
        Source: senderEmail
      };
      
      await sesClient.send(new SendEmailCommand(emailParams));
      console.log(`Successfully sent status email for image: ${imageId} to ${photographerEmail}`);
    } catch (error) {
      console.error("Error processing record: ", error);
    }
  }
}; 