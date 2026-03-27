import groovy.json.JsonOutput
import org.gradle.api.Project
import org.gradle.api.artifacts.ProjectDependency
import org.gradle.api.plugins.JavaPluginExtension
import java.io.File

val defaultJvmTarget = "21"

allprojects {
    tasks.register("exportWorkspace") {
        description = "Generates workspace.json for kotlin-lsp (includes testFixtures)"
        group = "ide"

        doLast {
            if (project != rootProject) return@doLast

            val root = rootProject
            val rootName = root.name
            val modules = mutableListOf<Map<String, Any?>>()
            val libraries = linkedMapOf<String, LibraryInfo>()
            val kotlinSettings = mutableListOf<Map<String, Any?>>()

            modules += containerModule(rootName, root.projectDir.absolutePath)

            val projects = listOf(root) + root.subprojects.sortedBy { it.path }
            projects.forEach { candidate ->
                val moduleName = if (candidate == root) {
                    rootName
                } else {
                    "$rootName${candidate.path.replace(":", ".")}"
                }

                if (candidate != root) {
                    modules += containerModule(moduleName, candidate.projectDir.absolutePath)
                }

                val javaExt = candidate.extensions.findByType(JavaPluginExtension::class.java) ?: return@forEach
                processSourceSets(
                    project = candidate,
                    moduleName = moduleName,
                    javaExt = javaExt,
                    modules = modules,
                    libraries = libraries,
                    kotlinSettings = kotlinSettings,
                    jvmTarget = defaultJvmTarget,
                )
            }

            val javaHome = org.gradle.internal.jvm.Jvm.current().javaHome.absolutePath
            val workspace = linkedMapOf<String, Any?>(
                "modules" to modules,
                "libraries" to libraries.values.sortedBy { it.name }.map { it.toMap() },
                "sdks" to listOf(javaSdk(javaHome, defaultJvmTarget)),
                "kotlinSettings" to kotlinSettings,
            )

            val outFile = File(root.projectDir, "workspace.json")
            outFile.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(workspace)) + "\n")

            println("Generated ${outFile.absolutePath}")
            println("  Modules: ${modules.size}")
            println("  Libraries: ${libraries.size}")
            println("  Kotlin settings: ${kotlinSettings.size}")
        }
    }
}

data class LibraryInfo(
    val name: String,
    val jarPath: String,
    val groupId: String,
    val artifactId: String,
    val version: String,
) {
    fun toMap(): Map<String, Any?> = linkedMapOf(
        "name" to name,
        "type" to "java-imported",
        "roots" to listOf(
            linkedMapOf(
                "path" to jarPath,
                "type" to "CLASSES",
            ),
        ),
        "properties" to linkedMapOf(
            "attributes" to linkedMapOf(
                "groupId" to groupId,
                "artifactId" to artifactId,
                "version" to version,
                "baseVersion" to version,
            ),
        ),
    )
}

fun containerModule(name: String, path: String): Map<String, Any?> = linkedMapOf(
    "name" to name,
    "dependencies" to listOf(
        moduleSourceDependency(),
        inheritedSdkDependency(),
    ),
    "contentRoots" to listOf(
        linkedMapOf(
            "path" to path,
        ),
    ),
)

fun moduleSourceDependency(): Map<String, Any?> = linkedMapOf(
    "type" to "moduleSource",
)

fun inheritedSdkDependency(): Map<String, Any?> = linkedMapOf(
    "type" to "inheritedSdk",
)

fun moduleDependency(name: String, scope: String): Map<String, Any?> = linkedMapOf(
    "type" to "module",
    "name" to name,
    "scope" to scope,
)

fun libraryDependency(name: String, scope: String): Map<String, Any?> = linkedMapOf(
    "type" to "library",
    "name" to name,
    "scope" to scope,
)

fun javaSdk(homePath: String, version: String): Map<String, Any?> = linkedMapOf(
    "name" to version,
    "type" to "JavaSDK",
    "version" to version,
    "homePath" to homePath,
    "additionalData" to "",
)

fun compilerArguments(jvmTarget: String): String {
    val payload = linkedMapOf<String, Any?>(
        "jvmTarget" to jvmTarget,
        "pluginOptions" to emptyList<String>(),
        "pluginClasspath" to emptyList<String>(),
    )
    return "J${JsonOutput.toJson(payload)}"
}

fun sourceRootType(path: String, isTest: Boolean): String {
    val normalizedPath = path.replace(File.separatorChar, '/')
    return when {
        normalizedPath.contains("/resources") && isTest -> "java-test-resource"
        normalizedPath.contains("/resources") -> "java-resource"
        normalizedPath.contains("/kotlin") && isTest -> "kotlin-test"
        normalizedPath.contains("/kotlin") -> "kotlin-source"
        normalizedPath.contains("/java") && isTest -> "java-test"
        normalizedPath.contains("/java") -> "java-source"
        else -> if (isTest) "java-test" else "java-source"
    }
}

fun kotlinSettingsEntry(
    module: String,
    sourceRoots: List<String>,
    isTestModule: Boolean,
    jvmTarget: String,
): Map<String, Any?> = linkedMapOf(
    "name" to "Kotlin",
    "sourceRoots" to sourceRoots,
    "configFileItems" to emptyList<Any>(),
    "module" to module,
    "useProjectSettings" to false,
    "implementedModuleNames" to emptyList<String>(),
    "dependsOnModuleNames" to emptyList<String>(),
    "additionalVisibleModuleNames" to emptyList<String>(),
    "productionOutputPath" to null,
    "testOutputPath" to null,
    "sourceSetNames" to emptyList<String>(),
    "isTestModule" to isTestModule,
    "externalProjectId" to module,
    "isHmppEnabled" to true,
    "pureKotlinSourceFolders" to emptyList<String>(),
    "kind" to "default",
    "compilerArguments" to compilerArguments(jvmTarget),
    "additionalArguments" to null,
    "scriptTemplates" to null,
    "scriptTemplatesClasspath" to null,
    "copyJsLibraryFiles" to false,
    "outputDirectoryForJsLibraryFiles" to null,
    "targetPlatform" to null,
    "externalSystemRunTasks" to emptyList<String>(),
    "version" to 5,
    "flushNeeded" to false,
)

fun processSourceSets(
    project: Project,
    moduleName: String,
    javaExt: JavaPluginExtension,
    modules: MutableList<Map<String, Any?>>,
    libraries: MutableMap<String, LibraryInfo>,
    kotlinSettings: MutableList<Map<String, Any?>>,
    jvmTarget: String,
) {
    val hasTestFixtures = javaExt.sourceSets.findByName("testFixtures") != null

    javaExt.sourceSets.forEach { sourceSet ->
        val sourceSetName = sourceSet.name
        val isTest = sourceSetName == "test"
        val isTestFixtures = sourceSetName == "testFixtures"
        val fullName = "$moduleName.$sourceSetName"

        val dependencies = mutableListOf<Map<String, Any?>>(
            moduleSourceDependency(),
            inheritedSdkDependency(),
        )

        if (isTest || isTestFixtures) {
            dependencies += moduleDependency("$moduleName.main", "compile")
        }

        if (isTest && hasTestFixtures) {
            dependencies += moduleDependency("$moduleName.testFixtures", "compile")
        }

        val config = project.configurations.findByName(sourceSet.compileClasspathConfigurationName)
        val addedDependencies = mutableSetOf<String>()

        if (config != null && config.isCanBeResolved) {
            try {
                config.allDependencies
                    .filterIsInstance<ProjectDependency>()
                    .forEach { projectDependency ->
                        val depProject = projectDependency.dependencyProject
                        val depModuleName = "${project.rootProject.name}${depProject.path.replace(":", ".")}"
                        val requestedCapability = projectDependency.requestedCapabilities.firstOrNull()
                        val isTestFixtureDependency = requestedCapability?.name?.endsWith("-test-fixtures") == true
                        val targetModule = if (isTestFixtureDependency) "$depModuleName.testFixtures" else "$depModuleName.main"
                        val scope = if (isTest) "test" else "compile"
                        val dependencyKey = "$targetModule:$scope"

                        if (addedDependencies.add(dependencyKey)) {
                            dependencies += moduleDependency(targetModule, scope)
                        }
                    }

                config.resolvedConfiguration
                    .lenientConfiguration
                    .allModuleDependencies
                    .forEach { resolvedDependency ->
                        resolvedDependency.moduleArtifacts.forEach { artifact ->
                            val id = resolvedDependency.module.id
                            val coordinates = "${id.group}:${id.name}:${id.version}"
                            val libName = if (artifact.classifier.isNullOrBlank()) {
                                "Gradle: $coordinates"
                            } else {
                                "Gradle: $coordinates:${artifact.classifier}"
                            }
                            val scope = if (isTest) "test" else "compile"
                            val dependencyKey = "$libName:$scope"

                            if (addedDependencies.add(dependencyKey)) {
                                dependencies += libraryDependency(libName, scope)
                            }

                            libraries.getOrPut(libName) {
                                LibraryInfo(
                                    name = libName,
                                    jarPath = artifact.file.absolutePath,
                                    groupId = id.group,
                                    artifactId = id.name,
                                    version = id.version,
                                )
                            }
                        }
                    }
            } catch (e: Exception) {
                println("  Warning: ${project.path}/${sourceSet.compileClasspathConfigurationName}: ${e.message}")
            }
        }

        val sourceDirs = sourceSet.allSource.srcDirs
            .filter { it.exists() }
            .sortedBy { it.absolutePath }

        val sourceRoots = sourceDirs.map { srcDir ->
            linkedMapOf<String, Any?>(
                "path" to srcDir.absolutePath,
                "type" to sourceRootType(srcDir.absolutePath, isTest),
            )
        }

        val contentRoots = if (sourceRoots.isNotEmpty()) {
            val sourceSetRoot = sourceDirs.firstOrNull()?.parentFile?.absolutePath
                ?: "${project.projectDir.absolutePath}/src/$sourceSetName"
            listOf(
                linkedMapOf<String, Any?>(
                    "path" to sourceSetRoot,
                    "sourceRoots" to sourceRoots,
                ),
            )
        } else {
            emptyList()
        }

        modules += linkedMapOf(
            "name" to fullName,
            "dependencies" to dependencies,
            "contentRoots" to contentRoots,
        )

        kotlinSettings += kotlinSettingsEntry(
            module = fullName,
            sourceRoots = sourceDirs.map { it.absolutePath },
            isTestModule = isTest,
            jvmTarget = jvmTarget,
        )
    }
}
