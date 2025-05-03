import { SQSHandler } from "aws-lambda";
import { S3Client, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({});
const bucketName = process.env.BUCKET_NAME || "";

export const handler: SQSHandler = async (event) => {
  console.log("Processing invalid image removal event");
  
  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      console.log("DLQ Message Body:", JSON.stringify(body, null, 2));
      
      const message = JSON.parse(body.Message);
      
      for (const s3Record of message.Records) {
        const bucket = s3Record.s3.bucket.name;
        const key = decodeURIComponent(s3Record.s3.object.key.replace(/\+/g, ' '));
        
        console.log(`Processing invalid file for removal: ${key} from bucket: ${bucket}`);
        
        // First confirm the object exists
        try {
          await s3Client.send(new HeadObjectCommand({
            Bucket: bucket,
            Key: key
          }));
          
          // If the file exists, delete it
          const deleteParams = {
            Bucket: bucket,
            Key: key
          };
          
          await s3Client.send(new DeleteObjectCommand(deleteParams));
          console.log(`Successfully removed invalid file: ${key} from bucket: ${bucket}`);
        } catch (err: any) {
          // If the file doesn't exist anymore, just log and continue
          if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
            console.log(`File ${key} already deleted or not found`);
          } else {
            throw err;
          }
        }
      }
    } catch (error) {
      console.error("Error processing DLQ record: ", error);
    }
  }
}; 