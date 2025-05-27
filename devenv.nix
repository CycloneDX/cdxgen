{ pkgs, lib, inputs, config, ... }:
let pkgs-unstable = import inputs.nixpkgs-unstable { system = pkgs.stdenv.system; };
in
{
  # Language-specific topions
  options = {
    profile = lib.mkOption {
      type = lib.types.enum [ "ruby" "php" "c" "cplusplus" "go" "swift" "scala" "sbt" "mill" "rust" "python" "poetry" "uv" "dotnet" "android" "flutter" "reactNative" "basic" ];
      default = "basic";
      description = "Development profile to use";
    };
  };
  config = {
      android = {
        enable = lib.mkIf (lib.elem config.profile [ "android" "flutter" "reactNative" ]) true;
        platforms.version = [ "34" ];
        flutter = {
          enable = lib.mkIf (config.profile == "flutter") true;
        };
        reactNative = {
          enable = lib.mkIf (config.profile == "reactNative") true;
        };
      };
      languages = {
        python = lib.mkIf (lib.elem config.profile [ "python" "poetry" "uv" ] == true) {
          enable = true;
          venv.enable = true;
          venv.quiet = true;
          version = "3.13";
          poetry.enable = lib.mkIf (config.profile == "poetry") true;
          uv.enable = lib.mkIf (config.profile == "uv") true;
        };
        javascript = {
          enable = true;
          package = pkgs-unstable.nodejs_24;
        };
        java = lib.mkIf (lib.elem config.profile [ "android" "flutter" "reactNative" ] == false) {
          enable = true;
          jdk.package = pkgs.jdk23_headless;
        };
        ruby = {
          enable = lib.mkIf (config.profile == "ruby") true;
          version = "3.4.3";
        };
        dotnet = {
          enable = lib.mkIf (config.profile == "dotnet") true;
        };
        swift = {
          enable = lib.mkIf (config.profile == "swift") true;
        };
        c = {
          enable = lib.mkIf (config.profile == "c") true;
        };
        cplusplus = {
          enable = lib.mkIf (config.profile == "cplusplus") true;
        };
        go = {
          enable = lib.mkIf (config.profile == "go") true;
        };
        rust = {
          enable = lib.mkIf (config.profile == "rust") true;
        };
        scala = lib.mkIf (lib.elem config.profile [ "scala" "sbt" "mill" ] == true) {
          enable = lib.mkIf (config.profile == "scala") true;
          sbt.enable = lib.mkIf (config.profile == "sbt") true;
          mill.enable = lib.mkIf (config.profile == "mill") true;
        };
        php = {
          enable = lib.mkIf (config.profile == "php") true;
          extensions = [
            "openssl"
            "zip"
          ];
          packages = {
            composer = pkgs.phpPackages.composer;
          };
        };
      };

      # Common packages
      packages = [
        pkgs-unstable.nodejs_24
        pkgs.python313Full
        pkgs-unstable.pnpm_10
      ];

      # Useful features
      devcontainer.enable = true;
      difftastic.enable = true;
      # Setup the latest cdxgen using pnpm
      enterShell = ''
        set -e
        pnpm install --config.strict-dep-builds=true --package-import-method copy --frozen-lockfile
      '';

      # Tasks
      tasks."pr:prepare" = {
        exec = ''
        pnpm run lint && pnpm run gen-types && pnpm test
        '';
      };

      tasks."pnpm:outdated" = {
        exec = ''
        pnpm outdated
        '';
      };
  };
}
