# Lab Attendance (front end)

Static site for GitHub Pages. It talks to the API in `student-api-backend`.

| File | Purpose |
| --- | --- |
| `index.html` | Page structure and dialogs |
| `styles.css` | All styling, light and dark themes |
| `app.js` | All behavior: loading, statuses, filters, reports |
| `config.js` | The API address (`API_URL`). Edit this if your Vercel URL changes |

After editing `styles.css` or `app.js`, raise the `?v=` number in `index.html` so browsers load the new file.

Attendance rules: present and late count as attended, excused days are not counted, and each student is only measured on sessions of their own subject and section from their joined date onward.