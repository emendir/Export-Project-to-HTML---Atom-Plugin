# 2.8.1 (2024-04-21)
- bugfix when downloading external resources without existing WebPublish tree

# 2.8.0 (2023-11-20)
- added settings for external resource download path

# 2.7.0 (2023-11-20)
- fixed issue with markdown codeblocks without specified languages

# 2.6.0 (2023-11-19)
- added support for downloading resources with HTTP 301 redirects

# 2.5.14 (2023-06-05)
- create log file with broken links in Markdown pages

# 2.5.10 (2023-03-05)
- now closes inactive TextEditor Panes to avoid skipping the files opened in those editors (better solution coming)
# 2.5.5 (2022-08-19)
- fixed links to project-internal resources with relative paths

# v2.5.0 (2022-06-05)
- Only render filetypes specified in the `file_types_to_convert_to_html` setting to html, copy all other files.
- Enabled remarkable style download-url markdown of the type `[click to download](https://somewhere.com/fil23.txt "download")`.
- `download_external_stylesheets` and `download_external_scripts` to download externally referenced css and javascript files in the converted html files, including them in the generated website in order to make it standalone

# v2.1.0 (2022-04-21)
Fixed images not showing on markdown files rendered to html.

# v2.0.1
Made markdown render dark theme.