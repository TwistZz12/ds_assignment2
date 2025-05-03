import { S3Event, SQSHandler } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const tableName = process.env.TABLE_NAME || "";
const bucketName = process.env.BUCKET_NAME || "";

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event, null, 2));
  
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const s3Event = JSON.parse(body.Message) as S3Event;
      
      for (const s3Record of s3Event.Records) {
        const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));
        
        // Validate if image is jpeg or png
        if (!key.toLowerCase().endsWith('.jpeg') && 
            !key.toLowerCase().endsWith('.jpg') && 
            !key.toLowerCase().endsWith('.png')) {
          throw new Error(`Invalid file type for ${key}. Only .jpeg, .jpg, and .png are allowed.`);
        }
        
        // Record the image in DynamoDB
        const params = {
          TableName: tableName,
          Item: {
            id: key,
            uploadTime: new Date().toISOString(),
            bucket: bucketName,
            size: s3Record.s3.object.size
          }
        };
        
        await ddbDocClient.send(new PutCommand(params));
        console.log(`Successfully logged image: ${key}`);
      }
    } catch (error) {
      console.error("Error processing record: ", error);
      throw error; // Re-throw to trigger DLQ
    }
  }
  
  return;
}; 