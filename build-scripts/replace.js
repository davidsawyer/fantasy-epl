var replace = require("replace"),
    cacheBuster = new Date().getTime();

replace({
  regex: /\/dist\/js\/index\.js\?\d+/,
  replacement: "/dist/js/index.js?" + cacheBuster,
  paths: ["index.html"],
  recursive: true
});

