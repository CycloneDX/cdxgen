module.exports = {
  "env": {
    "node": true,
    "es2021": true
  },
  "plugins": ["prettier"],
  "extends": ["eslint:recommended", "plugin:prettier/recommended"],
  "overrides": [],
  "parserOptions": {
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "rules": {
    "prettier/prettier": "error",
    "no-constant-binary-expression": "error",
    "prefer-const": ["error", {
      "destructuring": "all"
    }],
    "prefer-arrow-callback": "error",
    "require-await": "error",
    "no-useless-return": "error",
    "func-style": ["error", "declaration", {
      "allowArrowFunctions": true
    }]
  }
};
