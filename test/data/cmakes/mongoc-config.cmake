include(CMakeFindDependencyMacro)
find_dependency(bson-1.0 @MONGOC_MAJOR_VERSION@.@MONGOC_MINOR_VERSION@.@MONGOC_MICRO_VERSION@)
include("${CMAKE_CURRENT_LIST_DIR}/mongoc-targets.cmake")

set(_mongoc_built_with_bundled_utf8proc "@USE_BUNDLED_UTF8PROC@")
if(NOT _mongoc_built_with_bundled_utf8proc AND NOT TARGET PkgConfig::PC_UTF8PROC)
  # libmongoc was compiled against an external utf8proc and links against a 
  # FindPkgConfig-generated IMPORTED target. Find that package and generate that 
  # imported target here:
  find_dependency(PkgConfig)
  pkg_check_modules(PC_UTF8PROC REQUIRED libutf8proc IMPORTED_TARGET GLOBAL)
endif()
