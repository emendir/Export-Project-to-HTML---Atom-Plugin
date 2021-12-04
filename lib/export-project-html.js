let utils
(function() {
  var CompositeDisposable, ExportHtml, Shell, _, aliases, exec, os, path;


  CompositeDisposable = require('atom').CompositeDisposable;

  os = require("os");

  path = require("path");

  exec = require('child_process').exec;

  Shell = require('shell');

  _ = require('underscore-plus');

  aliases = require('./aliases');
  fs = require('fs');


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

    export: function() {
      console.log("enter function export");

      // making the following function run for every new tab that is opened in atom
      atom.workspace.onDidOpen(function(event) {
        var exporter = {
          isMarkdownEditor: function(editor) {
            return ['source.gfm', 'text.md'].includes(editor.getGrammar().scopeName)
          },
          getUtils: function () {
            if (!utils) utils = require('./utils')
              return utils
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
            console.log(dir);
            if (!fs.existsSync(dir)) {
            	fs.mkdirSync(dir, {
            		recursive: true
            	});
            }
            if(this.isMarkdownEditor(atom.workspace.getActiveTextEditor()))
            {
              console.log("FOUND MARKDOWN");
              const editor = atom.workspace.getActiveTextEditor()
              if (editor == null) {
                return
              }
              // mp = require("markdown-preview")
              renderer = require('./renderer')
              
              const text = editor.getSelectedText() || editor.getText()
              const html = await renderer.toHTML(
                text,
                editor.getPath(),
                editor.getGrammar()
              )
              fs.writeFile(target_path,html,function(err3){
                if (err3) {
                  atom.notifications.addError('error', {detail: err3, dismissable: true});
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
          getHtml: function(editor, title, path, cb) {
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
                  return cb(path, html);
                };
              })(this));
            } else if (grammar.scopeName === "text.html.basic") {
              html = text;
              return cb(path, html);
            } else {
              language = (title != null ? (ref = title.split(".")) != null ? ref.pop() : void 0 : void 0) || ((ref1 = grammar.scopeName) != null ? ref1.split(".").pop() : void 0);
              body = this.buildBodyByCode(_.escape(text), language);
              html = this.buildHtml(body, language);
              return cb(path, html);
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
        exporter.run();
      });




      var project_paths = atom.project.getDirectories();
      //console.log(atom.project.getDirectories()[0].getEntriesSync());
      for (let i = 0; i < project_paths.length; i++) {
        this.scanFolder(project_paths[i]);

      }
    },
    scanFolder: function(dir){
      /*opens every file in the directry paramater 'dir' in a new atom tab,
      and recurses this function for all directories in dir*/
      console.log(dir);
      var paths = dir.getEntriesSync();
      for (let i = 0; i < paths.length; i++) {
        path = paths[i];
        //console.log(path.getPath());
        if(path.isDirectory() && !atom.config.get("export-project-html.ignored_dirs").includes(path.getBaseName()))
        {
          this.scanFolder(path);
        }
        else {
          // checking if this file's extension is in the list of extesnions to ignore
          var ignore_this_file = false;
          for (var j = 0; j < atom.config.get("export-project-html.ignored_extensions").length; j++)
          {
            if(path.getBaseName().includes(atom.config.get("export-project-html.ignored_extensions")[j])){
              ignore_this_file = true;
              break;
            }
          }
          if (!ignore_this_file)
            atom.workspace.open(path.getPath());  // open file in atom so that it can get converted to html
        }


      }
    }

  };

}).call(this);
