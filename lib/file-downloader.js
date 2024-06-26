const fs = require('fs');
const https = require('https');
const urlModule = require('url');

function downloadFile(url, filepath) {
  checkAndCreateDirectory(filepath)
  
  // Parse the original URL
  const originalUrl = new URL(url);

  // Configure the request options
  const options = {
    hostname: originalUrl.hostname,
    path: originalUrl.pathname + originalUrl.search,
    method: 'GET',
  };

  // Send the HTTP request
  const req = https.request(options, (res) => {
    // Check if it's a redirect (status code 3xx)
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      // Parse the redirect URL
      const redirectUrl = new URL(res.headers.location);

      // Append the resource path from the original URL if missing
      if (!redirectUrl.pathname && originalUrl.pathname) {
        redirectUrl.pathname = originalUrl.pathname;
      }
      
      // console.log("file-downloader: redirected from " + url + " to " + redirectUrl.href)

      // Follow the redirect
      downloadFile(redirectUrl.href, filepath);
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
        console.error(`Failed to download file. Status: ${res.statusCode}\n${url}`);
        atom.notifications.addError(`Failed to download file. Status: ${res.statusCode}\n${url}`);
        return;
      }

      // Write the file to the local filepath
      fs.writeFileSync(filepath, fileBuffer);

      // console.log(`File downloaded successfully to: ${filepath}`);
    });
  });

  // Handle errors during the request
  req.on('error', (error) => {
    console.error(`Error downloading file: ${error.message}\n${url}`);
    atom.notifications.addError(`Error downloading file: ${error.message}\n${url}`);
  });

  // End the request
  req.end();
}

function checkAndCreateDirectory(filePath) {
    const directory = path.dirname(filePath);

    // Check if the directory already exists
    if (fs.existsSync(directory)) {
        return;
    }

    // If it doesn't exist, create it
    try {
        fs.mkdirSync(directory, { recursive: true });
        console.log('Directory created:', directory);
    } catch (error) {
        console.error('Error creating directory:', error);
    }
}
module.exports = downloadFile;
