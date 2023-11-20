(function() {


  CompositeDisposable = require('atom').CompositeDisposable;

  const os = require("os");
  const path = require("path");
  const exec = require('child_process').exec;
  const fs = require('fs');
  const http = require('https');
  const Shell = require('shell');
  const _ = require('underscore-plus');
  const downloadFile = require('./file-downloader');
  const aliases = require('./aliases');

  const splitLines = str => str.split(/\r?\n/);

  // load plugin settings
  const download_external_stylesheets = atom.config.get(
    "export-project-html.external_resources.download_external_stylesheets"
  )
  const download_external_scripts = atom.config.get(
    "export-project-html.external_resources.download_external_scripts"
  )
  const stylesheets_dir = atom.config.get("export-project-html.external_resources.stylesheets_dir")
  const scripts_dir = atom.config.get("export-project-html.external_resources.scripts_dir")

  // console.log(download_external_scripts)
  // console.log(download_external_stylesheets)

  const stylesheets_abs_dir = path.join(
    atom.project.getDirectories()[0].getPath(), "WebPublish", stylesheets_dir

  )
  const scripts_abs_dir = path.join(
    atom.project.getDirectories()[0].getPath(), "WebPublish", scripts_dir
  )
  // console.log(stylesheets_abs_dir)
  // console.log(scripts_abs_dir)
  const markdown_broken_url_log_filepath = path.join(
    atom.project.getDirectories()[0].getPath(),
    atom.config.get("export-project-html.markdown_broken_url_log_filename")
  );

  // create stylesheets and scripts paths if needed
  if (download_external_stylesheets && !fs.existsSync(stylesheets_abs_dir)) {
    fs.mkdirSync(stylesheets_abs_dir, {
      recursive: true
    });
  }
  if (download_external_scripts && !fs.existsSync(scripts_abs_dir)) {
    fs.mkdirSync(scripts_abs_dir, {
      recursive: true
    });
  }

  async function processMarkdownEditor(target_path) {
    const editor = atom.workspace.getActiveTextEditor()
    const project_path = atom.project.getDirectories()[0].getPath()
    if (editor == null) {
      return
    }
    var title = editor.getTitle() || 'untitled';

    // Convert Markdown code to HTML
    renderer = require('./renderer')
    const text = editor.getText();
    var html = await renderer.toHTML(
      text,
      editor.getPath(),
      editor.getGrammar()
    );


    // put each href tag on a new line so that we can find and process
    // them more efficiently by assuming max 1 href per line of HTML
    html = html.replace(/<a href=/g, "\n<a href=")
    // Add HTML head & body tags, set stylesheet
    html = "<head><title>" + title + "</title></head>\n<body text='#ddd' bgcolor='#222'>\n" + html + "\n</body>"



    //-----Taking care of images and download links----------------------------------------
    var html_lines = splitLines(html)
    var new_html = ""

    for (var i = 0; i < html_lines.length; i++) { // for each line of HTML code
      var url_property_index = Math.max(
        html_lines[i].indexOf("src="), html_lines[i].indexOf("href=")
      )

      // if the line contains "src=" or "href="
      if (url_property_index > 0) {

        // trim start of HTML line up to and including the = sign of href= or src=
        var half_trimmed_line = html_lines[i].substring(url_property_index)
        half_trimmed_line = half_trimmed_line.substring(
          half_trimmed_line.indexOf("=") + 1
        )

        var quote_char = half_trimmed_line[0] // get quote char, allowing us to handle single or double quotes

        // remove starting quote from URL
        var url_path = half_trimmed_line.substring(1)
        // remove closing quote from URL and the rest of the HTML code following it
        url_path = url_path.substring(0, url_path.indexOf(quote_char))

        tag = url_path.split("#")[1]
        url_path = url_path.split("#")[0]

        // If this URL is for a file in this project
        if (url_path.indexOf("://") == -1) { // if it's a path, not https:// or ipfs:// or anything like that

          // Getting absolute file path for URL on this computer
          var abs_path = ""
          var is_absolute_path = false // whether or not url_path is an absolute file path
          // if the path is relative to the project root
          if (url_path[0] == "/" && fs.existsSync(path.join(project_path, url_path))) {
            abs_path = path.join(project_path, url_path)
          }
          // URL path is assumed to be relative to this markdown file's dir
          else if (fs.existsSync(path.join(editor.getPath(), "..", url_path))) {
            abs_path = path.join(editor.getPath(), "..", url_path)
          }
          // if URL is absolute but inside the project directory
          else if (fs.existsSync(url_path) && url_path.substring(0, project_path.length) == project_path) {
            abs_path = url_path
            is_absolute_path = true
          }
          // if we couldn't find the file from the URL, or it is an absolute path warn the user
          if (abs_path == "" || is_absolute_path) {
            atom.notifications.addWarning((is_absolute_path ? "Absolute Path:" : "Path not found:\nfile: ") + editor.getPath() + "\nURL: " + url_path)

            fs.appendFile(
              markdown_broken_url_log_filepath,
              (is_absolute_path ? "Absolute Path: " : "Path not found: ") + editor.getPath() + ": " + url_path + "\n",
              function() {}
            )
          }

          if (abs_path != "") { // we found the file from the URL

            // finding path of src relative to project
            var rel_path = abs_path.substring(atom.project.getDirectories()[0].getPath().length + 1)
            editor_rel_path = editor.getPath().substring(atom.project.getDirectories()[0].getPath().length + 1)

            var n_folders = (editor_rel_path.match(/\//g) || []).length
            for (var j = 0; j < n_folders; j++)
              rel_path = "../" + rel_path


            // working out path of src relative to html file by adding the right sequence of "../../../"
            var extension = url_path.split(".").slice(-1)[0]
            if (extension == "md" || extension in atom.config.get("export-project-html.file_types_to_convert_to_html")) {
              rel_path = rel_path + ".html"
              // console.log(rel_path)
              html_lines[i] = html_lines[i].replace(url_path, rel_path)
            } else {
              // take care of images and other resources whose path was rendered to an absolute path
              if (rel_path != "") {
                // replacing the absolute path specified src in the html with the relative path
                html_lines[i] = html_lines[i].replace(url_path, rel_path)
                // workging out the absolute path where we have to copy the src file to
                var new_file_path = url_path.replace(atom.project.getDirectories()[0].getPath(), path.join(atom.project.getDirectories()[0].getPath(), "WebPublish"));
                if (fs.existsSync(url_path)) {
                  const new_file_dir = path.dirname(new_file_path);
                  if (!fs.existsSync(new_file_dir)) {
                    fs.mkdirSync(new_file_dir, {
                      recursive: true
                    });
                  }

                  fs.copyFile(url_path, new_file_path, (err) => {
                    // console.log(url_path)
                    // console.log(new_file_path)
                    if (err) throw err;
                  })
                }
              }
            }
          }
        }
      }
      new_html += html_lines[i] + "\n"
    }
    html = new_html
    // converting markdown download urls to html download urls
    html = html.replace(/<a title="download" href=/, "<a download href=")
    //END--Taking care of images----------------------------------------
    fs.writeFile(target_path, html, function(err3) {
      if (err3) {
        atom.notifications.addError('error', {
          detail: err3,
          dismissable: true
        });
        return;
      }
    })
  }

  module.exports = ExportHtml = {
    subscriptions: null,
    activate: function() {
      this.subscriptions = new CompositeDisposable;
      return this.subscriptions.add(atom.commands.add('atom-workspace', {
        'export-project-html:export': (function(_this) {
          return function() {
            return _this["export"]();
          };
        })(this)
      }));
    },
    deactivate: function() {
      this.subscriptions.dispose();
    },

    export: async function() {
      var exporter = {
        isMarkdownEditor: function(editor) {
          return ['source.gfm', 'text.md'].includes(editor.getGrammar().scopeName)
        },
        run: async function() {
          var editor, html, text, title, tmpdir;
          editor = atom.workspace.getActiveTextEditor();
          tmpdir = os.tmpdir();
          if (editor == null) {
            return;
          }
          title = editor.getTitle() || 'untitled';

          const target_path = editor.getPath().replace(atom.project.getDirectories()[0].getPath(), path.join(atom.project.getDirectories()[0].getPath(), "WebPublish")) + ".html";
          const target_path_dir = path.dirname(target_path);
          if (!fs.existsSync(target_path_dir)) {
            fs.mkdirSync(target_path_dir, {
              recursive: true
            });
          }
          // if this is a markdown file, render the markdown to html
          if (this.isMarkdownEditor(atom.workspace.getActiveTextEditor())) {
            await processMarkdownEditor(target_path);
            return;
          }




          text = editor.getText();
          return html = this.getHtml(editor, title, target_path, (function(_this) {
            return function(path, contents) {
              var fs;
              fs = require('fs');
              return fs.writeFileSync(path, contents, "utf8");
            };
          })(this));
        },
        openPath: function(filePath) {
          var process_architecture;
          process_architecture = process.platform;
          switch (process_architecture) {
            case 'darwin':
              return exec('open "' + filePath + '"');
            case 'linux':
              return exec('xdg-open "' + filePath + '"');
            case 'win32':
              return Shell.openExternal('file:///' + filePath);
          }
        },
        getHtml: function(editor, title, paath, cb) {
          var body, grammar, html, language, ref, ref1, roaster, style, text;
          grammar = editor.getGrammar();
          text = editor.getText();
          style = "";
          if (grammar.scopeName === "source.gfm") {
            roaster = require("roaster");
            return roaster(text, {
              isFile: false
            }, (function(_this) {
              return function(err, contents) {
                var html;
                html = _this.buildHtml(contents);
                return cb(paath, html);
              };
            })(this));
          } else if (grammar.scopeName === "text.html.basic") {
            html = text;
            return cb(paath, html);
          } else {
            language = (title != null ? (ref = title.split(".")) != null ? ref.pop() : void 0 : void 0) || ((ref1 = grammar.scopeName) != null ? ref1.split(".").pop() : void 0);
            body = this.buildBodyByCode(_.escape(text), language);
            html = this.buildHtml(body, language);

            //-----Analysing html----------------------------------------
            var html_lines = splitLines(html);
            var new_html = "";
            // for every line of HTML
            for (var i = 0; i < html_lines.length; i++) {
              // check for URLs via "src=" or "href=" attributes inside of HTML
              var url_index = Math.max(html_lines[i].indexOf("src="), html_lines[i].indexOf("href="))
              // if this line contains a URL
              if (url_index > 0) {
                // get clean URL
                var url_path = html_lines[i].substring(url_index);
                url_path = url_path.substring(url_path.indexOf("=") + 2)
                url_index = url_path.indexOf("\"");
                url_path = url_path.substring(0, url_index)


                // if line is a reference to an https URL of an external script,
                // download that script and make a local reference
                if (download_external_scripts && html_lines[i].indexOf("<script ") >= 0 && url_path.substring(0, 8) == "https://") {
                  var filename = String(url_path.split("/").slice(-1))
                  const filepath = path.join(scripts_abs_dir, filename)
                  if (!fs.existsSync(filepath)) {
                    downloadFile(url_path, filepath)
                  }
                  var replacement_path = "/" + scripts_dir + "/" + filename
                  while (replacement_path.includes("//"))
                    replacement_path=replacement_path.replace("//", "/")
                  html_lines[i] = html_lines[i].replace(url_path, replacement_path)

                }
                // if line is a reference to an https URL of an external stylesheet,
                // download that stylesheet and make a local reference
                else if (download_external_stylesheets && html_lines[i].indexOf("<link rel=\"stylesheet\" ") >= 0 && url_path.substring(0, 8) == "https://") {
                  var filename = String(url_path.split("/").slice(-1))
                  const filepath = path.join(stylesheets_abs_dir, filename)
                  if (!fs.existsSync(filepath)) {
                    downloadFile(url_path, filepath)
                  }
                  var replacement_path = "/" + stylesheets_dir + "/" + filename
                  while (replacement_path.includes("//"))
                    replacement_path=replacement_path.replace("//", "/")
                  html_lines[i] = html_lines[i].replace(url_path, replacement_path)

                }
                // if the URL is an absolute path in this project,
                // change it to a path relative to the file
                else if (url_path.substring(0, atom.project.getDirectories()[0].getPath().length) == atom.project.getDirectories()[0].getPath()) {
                  // finding path of src relative to project
                  var rel_path = url_path.substring(atom.project.getDirectories()[0].getPath().length + 1)
                  // working out path of src relative to html file by adding the right sequence of "../../../"
                  var n_folders = (rel_path.match(/\//g) || []).length

                  for (var j = 0; j < n_folders; j++)
                    rel_path = "../" + rel_path

                  // replacing the absolute path specified src in the html with the relative path
                  html_lines[i] = html_lines[i].replace(url_path, rel_path)
                  // workging out the absolute path where we have to copy the src file to
                  var new_file_path = url_path.replace(atom.project.getDirectories()[0].getPath(), path.join(atom.project.getDirectories()[0].getPath(), "WebPublish"));
                  fs.copyFile(url_path, new_file_path, (err) => {
                    if (err) throw err;
                  })
                }
              }
              new_html += html_lines[i] + "\n";
            }
            html = new_html;

            return cb(paath, html);
          }
        },
        resolveAliase: function(language) {
          var table;
          table = {};
          aliases.table.split("\n").map(function(l) {
            return l.split(/,\s?/);
          }).forEach(function(l) {
            return l.forEach(function(d) {
              return table[d] = l[0];
            });
          });
          return table[language];
        },
        buildHtml: function(body, language) {
          var css, highlightjs, html, js, lang, style;
          language = this.resolveAliase(language);
          style = atom.config.get("export-project-html.style");
          highlightjs = "https://rawgithub.com/highlightjs/cdn-release/master/build";
          css = highlightjs + "/styles/" + style + ".min.css";
          js = highlightjs + "/highlight.min.js";
          lang = highlightjs + "/languages/" + language + ".min.js";
          html = "<html>\n<head>\n  <meta charset=\"UTF-8\">\n  <script src=\"https://code.jquery.com/jquery-2.1.4.min.js\"></script>\n  <link rel=\"stylesheet\" href=\"" + css + "\">\n  <script src=\"" + js + "\"></script>\n  <script src=\"" + lang + "\"></script>\n  <style>\n    body {\n      margin: 0px;\n      padding: 15px;\n      font-size: " + (atom.config.get("export-project-html.fontSize")) + "\n    }\n    .hljs {\n      margin: -15px;\n      word-wrap: break-word;\n    }\n    body, .hljs {\n      font-family: " + (atom.config.get("editor.fontFamily")) + ";\n    }\n    .number {\n      float:left;\n      text-align: right;\n      display: inline-block;\n      margin-right: 5px;\n    }\n    .ln {\n      " + (atom.config.get("export-project-html.lineNumber.styles")) + "\n    }\n    pre {\n      tab-size:      " + (atom.config.get("export-project-html.tabWidth")) + ";\n    }\n  </style>\n</head>\n<body>\n" + body + "\n</body>\n</html>";
          return html;
        },
        buildBodyByCode: function(text, language) {
          var body, lines, width;
          lines = text.split(/\r?\n/);
          width = lines.length.toString().split("").length > 3 ? "40" : "20";
          if (atom.config.get("export-project-html.lineNumber.use")) {
            text = lines.map((function(_this) {
              return function(l, i) {
                return "<span class=\"number\"><span>" + (i + 1) + "</span></span><span class=\"code\">" + l + "</span>";
              };
            })(this)).join("\n");
          }
          body = "<pre><code class=\"" + language + "\">\n" + text + "\n</code></pre>\n<script>hljs.initHighlightingOnLoad();</script>\n<script>\n  setTimeout(function() {\n    $(\".number\").css(\"width\", \"" + width + "px\");\n    $(\".number span\").attr(\"class\", \"ln hljs-subst\");\n    resize();\n    var timer = false;\n    $(window).resize(function() {\n      if (timer !== false) {\n        clearTimeout(timer);\n      }\n      timer = setTimeout(function() {\n        resize();\n      }, 200);\n    })\n\n  }, 100);\n  function resize() {\n    $(\"span.code\").each(function(i, c) {\n      var h = $(c).height();\n      $(c).prev().height(h);\n    });\n  }\n</script>";
          return body;
        }
      };

      // clear broken URLs log file
      if (fs.existsSync(markdown_broken_url_log_filepath)) {
        fs.unlinkSync(markdown_broken_url_log_filepath);
      }

      // close unfocused panes, cause the following code can't process their open files
      var panes = atom.workspace.getPanes()
      for (var i = 0; i < panes.length; i++) {
        if (atom.workspace.getPanes()[i].activeItem instanceof atom.textEditors.getActiveTextEditor().constructor &&
          panes[i].activeItem.id != atom.workspace.getActiveTextEditor.id)
          panes[i].close()
      }

      var num_editors = (await atom.workspace.getPaneItems()).length; // for working out whether or not files were already opened in Atom

      async function scanFolder(dir) {
        /*opens every file in the directry paramater 'dir' in a new atom tab,
        and recurses this function for all directories in dir*/
        var paths = dir.getEntriesSync();
        for (let i = 0; i < paths.length; i++) {
          var paath = paths[i];
          if (paath.isDirectory()) {
            if (!atom.config.get("export-project-html.ignored_dirs").includes(paath.getBaseName()) && paath.getBaseName() != "WebPublish") {
              await scanFolder(paath);
            }
          } else {
            // checking if this file's extension is in the list of extesnions to ignore
            var ignore_this_file = false;
            for (var j = 0; j < atom.config.get("export-project-html.ignored_extensions").length; j++) {
              if (paath.getBaseName().includes(atom.config.get("export-project-html.ignored_extensions")[j])) {
                ignore_this_file = true;
                break;
              }
            }
            var convert_to_html = false;
            if (!ignore_this_file)
              for (var j = 0; j < atom.config.get("export-project-html.file_types_to_convert_to_html").length; j++) {
                if (paath.getBaseName().includes(atom.config.get("export-project-html.file_types_to_convert_to_html")[j])) {
                  convert_to_html = true;
                  break;
                }
              }

            if (convert_to_html) {
              await atom.workspace.open(paath.getPath()); // open file in atom so that it can get converted to html
              await exporter.run();
              if ((await atom.workspace.getPaneItems()).length > num_editors) // if the file was not already open
              {
                await atom.workspace.closeActivePaneItemOrEmptyPaneOrWindow(); // close the opened tab
              }
            } else {
              if (ignore_this_file) {
                const target_path = paath.getPath().replace(atom.project.getDirectories()[0].getPath(), path.join(atom.project.getDirectories()[0].getPath(), "WebPublish"))
                fs.mkdirSync(path.dirname(target_path), {
                  recursive: true
                })
                fs.copyFile(paath.getPath(), target_path, (err) => {
                  if (err) throw err;
                  // console.log('File was copied to destination');
                });

              }
            }
          }


        }
        return true;
      }


      var project_paths = atom.project.getDirectories();

      for (let i = 0; i < project_paths.length; i++) {
        scanFolder(project_paths[i]);


      }

    },


  };

}).call(this);