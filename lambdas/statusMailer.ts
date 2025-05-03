import { SQSEvent } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

const sesClient = new SESClient({});
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.TABLE_NAME || "";
const senderEmail = process.env.SENDER_EMAIL || "noreply@example.com"; // Should be verified in SES

export const handler = async (event: SQSEvent) => {
  console.log("Processing status update email notification");
  
  for (const record of event.Records) {
    try {
      console.log("SQS Record:", JSON.stringify(record, null, 2));
      
      const body = JSON.parse(record.body);
      const message = JSON.parse(body.Message);
      
      const imageId = message.id;
      const status = message.update?.status;
      const reason = message.update?.reason || "No reason provided";
      
      if (!imageId) {
        console.error("Missing image ID in message");
        continue;
      }
      
      if (!status) {
        console.error("Missing status in message");
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
      
      // In a real application, the photographer's name and email would be required
      // For demo purposes, we'll use default values if they're not available
      const photographerName = Item.name || "Photographer";
      const photographerEmail = Item.email || "photographer@example.com";
      
      console.log(`Sending email notification to ${photographerEmail} for image: ${imageId}`);
      
      // Prepare email content
      const emailSubject = `Photo Review Status: ${status === "Pass" ? "Approved" : "Rejected"} - ${imageId}`;
      const emailBody = `
Dear ${photographerName},

Your image "${imageId}" has been reviewed and has been ${status === "Pass" ? "APPROVED" : "REJECTED"}.

${status === "Reject" ? `Reason: ${reason}` : ""}

Thank you for your submission.

Photo Gallery Team
      `;
      
      // Send email notification
      const emailParams = {
        Destination: {
          ToAddresses: [photographerEmail]
        },
        Message: {
          Body: {
            Text: {
              Data: emailBody
            }
          },
          Subject: {
            Data: emailSubject
          }
        },
        Source: senderEmail
      };
      
      try {
        await sesClient.send(new SendEmailCommand(emailParams));
        console.log(`Successfully sent status email for image: ${imageId} to ${photographerEmail}`);
      } catch (sesError) {
        console.error("Error sending email: ", sesError);
        // We don't want to fail the whole function if email sending fails
        // Just log the error and continue
      }
    } catch (error) {
      console.error("Error processing record: ", error);
    }
  }
}; 