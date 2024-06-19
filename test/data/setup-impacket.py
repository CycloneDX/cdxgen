#!/usr/bin/env python
# $Id$

import glob
import os
import platform

from setuptools import setup

PACKAGE_NAME = "impacket2"

if platform.system() != 'Darwin':
    data_files = [(os.path.join('share', 'doc', PACKAGE_NAME), ['README.md', 'LICENSE']+glob.glob('doc/*'))]
else:
    data_files = []

def read(fname):
    return open(os.path.join(os.path.dirname(__file__), fname)).read()

setup(name = PACKAGE_NAME,
      version = "0.9.21-dev",
      package_dir={'': 'src'},
      platforms = ["Unix"],
      packages=['impacket2', 'impacket2.dcerpc', 'impacket2.examples', 'impacket2.dcerpc.v5', 'impacket2.dcerpc.v5.dcom',
                'impacket2.krb5', 'impacket2.ldap', 'impacket2.examples.ntlmrelayx',
                'impacket2.examples.ntlmrelayx.clients', 'impacket2.examples.ntlmrelayx.servers',
                'impacket2.examples.ntlmrelayx.servers.socksplugins', 'impacket2.examples.ntlmrelayx.utils',
                'impacket2.examples.ntlmrelayx.attacks'],
      data_files = data_files,
      install_requires=['pyasn1>=0.2.3', 'pycryptodomex', 'pyOpenSSL>=0.13.1', 'six', 'ldap3==2.5.1', 'ldapdomaindump>=0.9.0', 'flask>=1.0'],
      extras_require={
                      'pyreadline:sys_platform=="win32"': [],
                      'python_version<"2.7"': [ 'argparse' ],
                    },
      classifiers = [
          "Programming Language :: Python :: 3.6",
          "Programming Language :: Python :: 2.7",
          "Programming Language :: Python :: 2.6",
      ]
)
