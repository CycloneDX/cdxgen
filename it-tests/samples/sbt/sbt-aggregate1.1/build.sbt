import scala.util.Random
import sbt.complete.Parsers
import sbt.complete.Parser
import complete.DefaultParsers._

import java.io.{BufferedWriter, FileWriter}

lazy val projA = project.in(file("projA"))
	.aggregate(projB, projC)

lazy val projD = project.in(file("projD"))
	.settings(
		libraryDependencies := Seq("io.circe" %% "circe-parser" % "0.14.2")
	)

lazy val projB = project.in(file("projB"))
	.settings(
		libraryDependencies := Seq("org.http4s" %% "http4s-core" % "0.23.12")
	)
	.dependsOn(projD)

lazy val projC = project.in(file("projC"))
	.settings(
		libraryDependencies := Seq("org.flywaydb" % "flyway-core" % "8.5.12")
	)

lazy val projE = project.in(file("projE"))
	.settings(
		libraryDependencies := Seq("com.typesafe.akka" %% "akka-http" % "10.2.9")
	)
