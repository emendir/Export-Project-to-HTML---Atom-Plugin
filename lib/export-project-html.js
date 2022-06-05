(function() {
  var CompositeDisposable, ExportHtml, Shell, _, aliases, exec, os, path;


  CompositeDisposable = require('atom').CompositeDisposable;

  os = require("os");

  path = require("path");

  exec = require('child_process').exec;
  const http = require('https');
  Shell = require('shell');

  _ = require('underscore-plus');

  aliases = require('./aliases');
  fs = require('fs');
  const splitLines = str => str.split(/\r?\n/);

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

          os = require("os");
          path = require("path");
          exec = require('child_process').exec;
          Shell = require('shell');
          _ = require('underscore-plus');
          aliases = require('./aliases');

          var editor, html, text, title, tmpdir;
          editor = atom.workspace.getActiveTextEditor();
          tmpdir = os.tmpdir();
          if (editor == null) {
            return;
          }
          title = editor.getTitle() || 'untitled';

          const target_path = editor.getPath().replace(atom.project.getDirectories()[0].getPath(), path.join(atom.project.getDirectories()[0].getPath(), "WebPublish")) + ".html";
          const dir = path.dirname(target_path);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, {
              recursive: true
            });
          }
          // if this is a markdown file, render the markdown to html
          if (this.isMarkdownEditor(atom.workspace.getActiveTextEditor())) {
            const editor = atom.workspace.getActiveTextEditor()
            if (editor == null) {
              return
            }
            // mp = require("markdown-preview")
            renderer = require('./renderer')

            const text = editor.getText();
            var html = await renderer.toHTML(
              text,
              editor.getPath(),
              editor.getGrammar()
            );
            html = "<head><title>" + title + "</title></head>\n<body text='#ddd' bgcolor='#222'>\n" + html + "\n</body>"


            //-----Taking care of images and download links----------------------------------------
            var html_lines = splitLines(html)
            var new_html = ""
            for (var i = 0; i < html_lines.length; i++) {
              var p = Math.max(html_lines[i].indexOf("src="), html_lines[i].indexOf("href="))
              if (p > 0) {
                var abs_path = html_lines[i].substring(p + 5)
                p = abs_path.indexOf("\"")
                abs_path = abs_path.substring(0, p)
                if (atom.config.get("export-project-html.download_external_scripts"))
                  if (abs_path.substring(0, atom.project.getDirectories()[0].getPath().length) == atom.project.getDirectories()[0].getPath()) {
                    // finding path of src relative to project
                    var rel_path = abs_path.substring(atom.project.getDirectories()[0].getPath().length + 1)
                    // working out path of src relative to html file by adding the right sequence of "../../../"
                    var n_folders = (rel_path.match(/\//g) || []).length
                    for (var j = 0; j < n_folders; j++)
                      rel_path = "../" + rel_path

                    // replacing the absolute path specified src in the html with the relative path
                    html_lines[i] = html_lines[i].replace(abs_path, rel_path)
                    // workging out the absolute path where we have to copy the src file to
                    var new_file_path = abs_path.replace(atom.project.getDirectories()[0].getPath(), path.join(atom.project.getDirectories()[0].getPath(), "WebPublish"));
                    fs.copyFile(abs_path, new_file_path, (err) => {
                      if (err) throw err;
                    })
                  }
              }
              new_html += html_lines[i] + "\n"
            }
            html = new_html
            // converting markdown download urls to html download urls
            html = html.replace("<a title=\"download\" href=", "<a download href=")
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
            for (var i = 0; i < html_lines.length; i++) {
              var p = Math.max(html_lines[i].indexOf("src="), html_lines[i].indexOf("href="))
              if (p > 0) {
                var abs_path = html_lines[i].substring(p);
                abs_path = abs_path.substring(abs_path.indexOf("=") + 2)
                p = abs_path.indexOf("\"");
                abs_path = abs_path.substring(0, p)

                function DownloadResource(url, filename) {
                  const file = fs.createWriteStream(filename);
                  const request = http.get(url, function(response) {
                    response.pipe(file);

                    // after download completed close filestream
                    file.on("finish", () => {
                      file.close();
                    });
                  });
                }

                if (html_lines[i].indexOf("<script ") >= 0 && atom.config.get("export-project-html.download_external_scripts")) {
                  if (abs_path.substring(0, 8) == "https://") {
                    var filename = String(abs_path.split("/").slice(-1))
                    const filepath = path.join(atom.project.getDirectories()[0].getPath(), "WebPublish", filename)
                    if (!fs.existsSync(filepath)) {
                      DownloadResource(abs_path, filepath)
                    }
                    html_lines[i] = html_lines[i].replace(abs_path, "/" + filename)
                  }
                } else if (html_lines[i].indexOf("<link rel=\"stylesheet\" ") >= 0 && atom.config.get("export-project-html.download_external_stylesheets")) {
                  if (abs_path.substring(0, 8) == "https://") {
                    var filename = String(abs_path.split("/").slice(-1))
                    const filepath = path.join(atom.project.getDirectories()[0].getPath(), "WebPublish", filename)
                    if (!fs.existsSync(filepath)) {
                      DownloadResource(abs_path, filepath)
                    }
                    html_lines[i] = html_lines[i].replace(abs_path, "/" + filename)
                  }
                } else if (abs_path.substring(0, atom.project.getDirectories()[0].getPath().length) == atom.project.getDirectories()[0].getPath()) {
                  // finding path of src relative to project
                  var rel_path = abs_path.substring(atom.project.getDirectories()[0].getPath().length + 1)
                  // working out path of src relative to html file by adding the right sequence of "../../../"
                  var n_folders = (rel_path.match(/\//g) || []).length
                  for (var j = 0; j < n_folders; j++)
                    rel_path = "../" + rel_path

                  // replacing the absolute path specified src in the html with the relative path
                  html_lines[i] = html_lines[i].replace(abs_path, rel_path)
                  // workging out the absolute path where we have to copy the src file to
                  var new_file_path = abs_path.replace(atom.project.getDirectories()[0].getPath(), path.join(atom.project.getDirectories()[0].getPath(), "WebPublish"));
                  fs.copyFile(abs_path, new_file_path, (err) => {
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
                fs.mkdirSync(path.dirname(target_path), { recursive: true })
                fs.copyFile(paath.getPath(), target_path, (err) => {
                  if (err) throw err;
                  console.log('File was copied to destination');
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