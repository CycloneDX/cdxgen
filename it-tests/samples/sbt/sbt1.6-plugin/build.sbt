scalaVersion := "2.13.7"

lazy val core = project.in(file("core"))
lazy val app = project.in(file("app")).dependsOn(core)
