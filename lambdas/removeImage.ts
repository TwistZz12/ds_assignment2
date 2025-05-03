import { SQSHandler } from "aws-lambda";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({});
const bucketName = process.env.BUCKET_NAME || "";

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event, null, 2));
  
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      const message = JSON.parse(body.Message);
      
      for (const s3Record of message.Records) {
        const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));
        
        // Delete the invalid file from S3
        const params = {
          Bucket: bucketName,
          Key: key
        };
        
        await s3Client.send(new DeleteObjectCommand(params));
        console.log(`Successfully removed invalid file: ${key}`);
      }
    } catch (error) {
      console.error("Error processing DLQ record: ", error);
    }
  }
}; 