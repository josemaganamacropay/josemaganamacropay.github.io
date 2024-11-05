// script.js

// Copy Hoppscotch JSON to clipboard
document
  .getElementById("copyInputButton")
  .addEventListener("click", function () {
    let hoppscotchText = document.getElementById("inputTextArea");
    hoppscotchText.select();
    document.execCommand("copy");
  });

// Copy Postman JSON to clipboard
document
  .getElementById("copyOutputButton")
  .addEventListener("click", function () {
    let postmanText = document.getElementById("outputTextArea");
    postmanText.select();
    document.execCommand("copy");
  });

// Upload Hoppscotch JSON file
document.getElementById("fileInput").addEventListener("change", function (e) {
  let file = e.target.files[0];
  let reader = new FileReader();
  reader.readAsText(file, "UTF-8");

  reader.onload = (readerEvent) => {
    let content = readerEvent.target.result;
    document.getElementById("inputTextArea").value = content;
  };
});

// Convert Hoppscotch JSON to Postman JSON
document.getElementById("convertButton").addEventListener("click", function () {
  let hoppscotchJsonText = document.getElementById("inputTextArea").value;

  try {
    hoppscotchJson = JSON.parse(hoppscotchJsonText);
    let postmanJson = convertToPostman(hoppscotchJson);
    let postmanJsonText = JSON.stringify(postmanJson, null, 2);
    document.getElementById("outputTextArea").value = postmanJsonText;
  } catch (error) {
    alert("Invalid JSON input. Please check your Hoppscotch JSON.");
    console.error(error);
  }
});

// Download Postman JSON file
document
  .getElementById("downloadButton")
  .addEventListener("click", function () {
    let postmanJsonText = document.getElementById("outputTextArea").value;
    let blob = new Blob([postmanJsonText], { type: "application/json" });
    let url = URL.createObjectURL(blob);
    let a = document.createElement("a");
    a.href = url;
    a.download = `${hoppscotchJson.name || "untitled"}.postman_collection.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

// Function to perform the conversion
function convertToPostman(hoppscotchJson) {
  // Initialize the Postman collection object
  let postmanCollection = {
    info: {
      name: hoppscotchJson.name || "Converted Collection",
      schema:
        "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      _postman_id: generateUUID(),
    },
    item: [],
    variable: [],
  };

  // Replace variables wrapped with << >> with {{ }}
  function replaceVariables(str) {
    return str.replace(/<<(\w+)>>/g, "{{$1}}");
  }

  // Function to translate Hoppscotch scripts to Postman scripts
  function translateScript(scriptContent) {
    if (!scriptContent) return "";

    // Replace 'pw.' with 'pm.' for methods
    scriptContent = scriptContent.replace(/\bpw\./g, "pm.");

    // Map specific methods
    const methodMappings = {
      "pm.env.set": "pm.environment.set",
      "pm.env.get": "pm.environment.get",
      "pm.env.unset": "pm.environment.unset",
      "pm.test": "pm.test",
      "pm.expect": "pm.expect",
      "pm.response.body": "pm.response.json()",
      "pm.response.status": "pm.response.status",
      "pm.response.headers": "pm.response.headers",
      "pm.request.url": "pm.request.url",
      "pm.request.headers": "pm.request.headers",
    };

    // Apply method mappings
    for (const [oldMethod, newMethod] of Object.entries(methodMappings)) {
      const regex = new RegExp(`\\b${oldMethod}\\b`, "g");
      scriptContent = scriptContent.replace(regex, newMethod);
    }

    // Handle pm.response.body usage
    scriptContent = scriptContent.replace(
      /pm\.response\.body\b/g,
      "pm.response.json()"
    );

    // Replace specific assertion methods
    scriptContent = scriptContent.replace(
      /\.toBeLevel(\d+)xx\(\)/g,
      function (match, p1) {
        switch (p1) {
          case "2":
            return ".to.be.success";
          case "3":
            return ".to.be.redirection";
          case "4":
            return ".to.be.clientError";
          case "5":
            return ".to.be.serverError";
          default:
            return match;
        }
      }
    );

    // Replace '.toBeType("type")' with '.to.be.a("type")'
    scriptContent = scriptContent.replace(
      /\.toBeType\("(\w+)"\)/g,
      '.to.be.a("$1")'
    );

    // Replace '.toHaveLength(n)' with '.to.have.lengthOf(n)'
    scriptContent = scriptContent.replace(
      /\.toHaveLength\((\d+)\)/g,
      ".to.have.lengthOf($1)"
    );

    // Replace '.toInclude(value)' with '.to.include(value)'
    scriptContent = scriptContent.replace(
      /\.toInclude\((.+?)\)/g,
      ".to.include($1)"
    );

    // Replace 'not.toBe' with 'to.not.equal'
    scriptContent = scriptContent.replace(
      /\.not\.toBe\((.+?)\)/g,
      ".to.not.equal($1)"
    );

    // Replace 'toBe' with 'to.equal'
    scriptContent = scriptContent.replace(/\.toBe\((.+?)\)/g, ".to.equal($1)");

    // Replace 'pm.response.json()' accessors
    scriptContent = scriptContent.replace(
      /pm\.response\.json\(\)(\.\w+)/g,
      "pm.response.json()$1"
    );

    return scriptContent;
  }

  // Process Hoppscotch items recursively
  function processItems(hoppscotchItems) {
    let items = [];

    hoppscotchItems.forEach((item) => {
      if (item.requests) {
        // Folder with requests
        let folder = {
          name: item.name,
          item: [],
        };

        item.requests.forEach((request) => {
          let postmanRequest = convertRequest(request);
          folder.item.push(postmanRequest);
        });

        if (item.folders && item.folders.length > 0) {
          folder.item = folder.item.concat(processItems(item.folders));
        }

        items.push(folder);
      } else if (item.folders) {
        // Folder with subfolders
        let folder = {
          name: item.name,
          item: processItems(item.folders),
        };
        items.push(folder);
      } else {
        // Single request
        let postmanRequest = convertRequest(item);
        items.push(postmanRequest);
      }
    });

    return items;
  }

  // Function to parse the endpoint into host and path
  function parseEndpoint(endpoint) {
    let url = {
      raw: endpoint,
      host: [],
      path: [],
    };

    // Remove any leading slashes
    while (endpoint.startsWith("/")) {
      endpoint = endpoint.substring(1);
    }

    // Match protocol if any
    let protocolMatch = endpoint.match(/^(https?:\/\/)/);
    if (protocolMatch) {
      url.protocol = protocolMatch[1].replace("://", "");
      endpoint = endpoint.substring(protocolMatch[1].length);
    }

    // Split host and path
    let parts = endpoint.split("/");
    let host = parts.shift(); // First part is host
    url.host = host.includes(".") ? host.split(".") : [host];

    // The rest are path segments
    url.path = parts.filter(Boolean);

    return url;
  }

  // Convert individual request
  function convertRequest(hoppscotchRequest) {
    let postmanRequest = {
      name: hoppscotchRequest.name || "Untitled Request",
      event: [],
      request: {
        method: hoppscotchRequest.method,
        header: [],
        url: {
          raw: "",
        },
        body: {},
      },
      response: [],
    };

    // Process URL
    let endpoint = replaceVariables(hoppscotchRequest.endpoint || "");

    // Remove any leading slashes from the endpoint
    while (endpoint.startsWith("/")) {
      endpoint = endpoint.substring(1);
    }

    // Set the raw URL
    postmanRequest.request.url.raw = endpoint;

    // Parse the endpoint to get host and path
    let urlObj = parseEndpoint(endpoint);
    postmanRequest.request.url.host = urlObj.host;
    postmanRequest.request.url.path = urlObj.path;

    // Process Params
    if (hoppscotchRequest.params && hoppscotchRequest.params.length > 0) {
      postmanRequest.request.url.query = [];
      hoppscotchRequest.params.forEach((param) => {
        if (param.active) {
          postmanRequest.request.url.query.push({
            key: replaceVariables(param.key),
            value: replaceVariables(param.value),
          });
        }
      });
    }

    // Process Headers
    if (hoppscotchRequest.headers) {
      hoppscotchRequest.headers.forEach((header) => {
        if (header.active) {
          postmanRequest.request.header.push({
            key: replaceVariables(header.key),
            value: replaceVariables(header.value),
            description: header.description || "",
          });
        }
      });
    }

    // Process Auth
    if (hoppscotchRequest.auth && hoppscotchRequest.auth.authActive) {
      let authType = hoppscotchRequest.auth.authType;
      if (authType === "bearer") {
        postmanRequest.request.auth = {
          type: "bearer",
          bearer: [
            {
              key: "token",
              value: replaceVariables(hoppscotchRequest.auth.token),
              type: "string",
            },
          ],
        };
      }
      // Add other auth types if necessary
    }

    // Process Body
    if (hoppscotchRequest.body && hoppscotchRequest.body.body) {
      let bodyContent = replaceVariables(hoppscotchRequest.body.body);
      postmanRequest.request.body = {
        mode: "raw",
        raw: bodyContent,
        options: {
          raw: {
            language: "json",
          },
        },
      };
    }

    // Process Pre-request Script
    if (hoppscotchRequest.preRequestScript) {
      // Translate the script content
      let scriptContent = translateScript(
        hoppscotchRequest.preRequestScript
      ).split("\n");
      postmanRequest.event.push({
        listen: "prerequest",
        script: {
          exec: scriptContent,
          type: "text/javascript",
        },
      });
    }

    // Process Test Script
    if (hoppscotchRequest.testScript) {
      // Translate the script content
      let scriptContent = translateScript(hoppscotchRequest.testScript).split(
        "\n"
      );
      postmanRequest.event.push({
        listen: "test",
        script: {
          exec: scriptContent,
          type: "text/javascript",
        },
      });
    }

    // Process Responses (Examples)
    if (hoppscotchRequest.responses) {
      for (let responseName in hoppscotchRequest.responses) {
        let hoppscotchResponse = hoppscotchRequest.responses[responseName];
        let postmanResponse = {
          name: responseName,
          originalRequest: postmanRequest.request,
          status: hoppscotchResponse.status,
          code: hoppscotchResponse.code,
          header: hoppscotchResponse.headers || [],
          body: hoppscotchResponse.body,
          _postman_previewlanguage: "json",
        };
        postmanRequest.response.push(postmanResponse);
      }
    }

    return postmanRequest;
  }

  // Start processing from root folders
  if (hoppscotchJson.folders) {
    postmanCollection.item = processItems(hoppscotchJson.folders);
  } else {
    postmanCollection.item = processItems([hoppscotchJson]);
  }

  // Extract variables and add to Postman variables
  let variableSet = new Set();
  let variableRegex = /<<(\w+)>>/g;
  let jsonString = JSON.stringify(hoppscotchJson);
  let match;
  while ((match = variableRegex.exec(jsonString)) !== null) {
    variableSet.add(match[1]);
  }

  variableSet.forEach((variable) => {
    postmanCollection.variable.push({
      key: variable,
      value: "",
    });
  });

  return postmanCollection;
}

// Helper function to generate UUIDs
function generateUUID() {
  var d = new Date().getTime();
  var d2 = (performance && performance.now && performance.now() * 1000) || 0;
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = Math.random() * 16;
    if (d > 0) {
      r = (d + r) % 16 | 0;
      d = Math.floor(d / 16);
    } else {
      r = (d2 + r) % 16 | 0;
      d2 = Math.floor(d2 / 16);
    }
    return (c == "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
