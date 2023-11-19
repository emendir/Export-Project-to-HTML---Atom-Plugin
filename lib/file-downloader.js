const fs = require('fs');
const https = require('https');


function downloadFile(url, filepath) {
  // Parse the URL to extract the hostname and path
  const {
    hostname,
    path
  } = new URL(url);

  // Configure the request options
  const options = {
    hostname,
    path,
    method: 'GET',
  };

  // Send the HTTP request
  const req = https.request(options, (res) => {
    // Check if it's a redirect (status code 3xx)
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      // Follow the redirect
      downloadFile(res.headers.location, filepath);
      return;
    }

    let fileBuffer = Buffer.from('');

    // Concatenate data chunks as they are received
    res.on('data', (chunk) => {
      fileBuffer = Buffer.concat([fileBuffer, chunk]);
    });

    // Handle the end of the response
    res.on('end', () => {
      // Check if the request was successful (status code 200)
      if (res.statusCode !== 200) {
        // console.error(`Failed to download file. Status: ${res.statusCode}`);
        atom.notifications.addError(`Failed to download file. Status: ${res.statusCode}`);
        
        return;
      }

      // Write the file to the local filepath
      fs.writeFileSync(filepath, fileBuffer);

      // console.log(`File downloaded successfully to: ${filepath}`);
    });
  });

  // Handle errors during the request
  req.on('error', (error) => {
    // console.error(`Error downloading file: ${error.message}`);
    atom.notifications.addError(`Error downloading file: ${error.message}`);
  });

  // End the request
  req.end();
}

module.exports = downloadFile;