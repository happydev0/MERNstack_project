const semver = require('semver');
const fs = require('fs');
const yaml = require('js-yaml');

const LATEST_EFFECTIVE_VERSION = '5.0';
const MONGODB_VERSIONS = ['latest', '4.4', '4.2', '4.0', '3.6', '3.4', '3.2', '3.0', '2.6'];
const NODE_VERSIONS = ['dubnium', 'erbium', 'fermium'];
const TOPOLOGIES = ['server', 'replica_set', 'sharded_cluster'];
const AWS_AUTH_VERSIONS = ['latest', '4.4'];
const OCSP_VERSIONS = ['latest', '4.4'];
const TLS_VERSIONS = ['latest', '4.2']; // also test on 4.2 because 4.4+ currently skipped on windows

const OPERATING_SYSTEMS = [
  {
    name: 'macos-1014',
    display_name: 'macOS 10.14',
    run_on: 'macos-1014',
    auth: false
  },
  {
    name: 'rhel70',
    display_name: 'RHEL 7.0',
    run_on: 'rhel70-small'
  },
  {
    name: 'ubuntu-14.04',
    display_name: 'Ubuntu 14.04',
    run_on: 'ubuntu1404-large',
    mongoVersion: '<4.2'
  },
  {
    name: 'ubuntu-18.04',
    display_name: 'Ubuntu 18.04',
    run_on: 'ubuntu1804-large',
    mongoVersion: '>=3.2',
    clientEncryption: true
  },
  {
    name: 'windows-64-vs2015',
    display_name: 'Windows (VS2015)',
    run_on: 'windows-64-vs2015-large',
    msvsVersion: 2015,
    mongoVersion: '<4.4'
  },
  {
    name: 'windows-64-vs2017',
    display_name: 'Windows (VS2017)',
    run_on: 'windows-64-vs2017-large',
    msvsVersion: 2017,
    mongoVersion: '<4.4'
  }
].map(osConfig =>
  Object.assign(
    {
      mongoVersion: '>=2.6',
      nodeVersion: 'dubnium',
      auth: false
    },
    osConfig
  )
);

// TODO: NODE-3060: enable skipped tests on windows
const WINDOWS_SKIP_TAGS = new Set(['atlas-connect', 'auth']);

const TASKS = [];
const SINGLETON_TASKS = [];

function makeTask({ mongoVersion, topology, tags = [] }) {
  return {
    name: `test-${mongoVersion}-${topology}`,
    tags: [mongoVersion, topology, ...tags],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION: mongoVersion,
          TOPOLOGY: topology
        }
      },
      { func: 'run tests' }
    ]
  };
}

const BASE_TASKS = [];
MONGODB_VERSIONS.forEach(mongoVersion => {
  TOPOLOGIES.forEach(topology => BASE_TASKS.push(makeTask({ mongoVersion, topology })));
});
BASE_TASKS.push({
  name: `test-latest-server-v1-api`,
  tags: ['latest', 'server', 'v1-api'],
  commands: [
    { func: 'install dependencies' },
    {
      func: 'bootstrap mongo-orchestration',
      vars: {
        VERSION: 'latest',
        TOPOLOGY: 'server',
        REQUIRE_API_VERSION: '1'
      }
    },
    {
      func: 'run tests',
      vars: {
        MONGODB_API_VERSION: '1',
        NO_EXIT: ''
      }
    }
  ]
});

// manually added tasks
Array.prototype.push.apply(TASKS, [
  {
    name: 'test-atlas-connectivity',
    tags: ['atlas-connect'],
    commands: [{ func: 'install dependencies' }, { func: 'run atlas tests' }]
  },
  {
    name: 'test-atlas-data-lake',
    commands: [
      { func: 'install dependencies' },
      { func: 'bootstrap mongohoused' },
      { func: 'run data lake tests' }
    ]
  },
  {
    name: 'test-auth-kerberos',
    tags: ['auth', 'kerberos'],
    commands: [{ func: 'install dependencies' }, { func: 'run kerberos tests' }]
  },
  {
    name: 'test-auth-ldap',
    tags: ['auth', 'ldap'],
    commands: [{ func: 'install dependencies' }, { func: 'run ldap tests' }]
  },
  {
    name: 'test-ocsp-valid-cert-server-staples',
    tags: ['ocsp'],
    commands: [
      { func: 'run-valid-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
    ]
  },
  {
    name: 'test-ocsp-invalid-cert-server-staples',
    tags: ['ocsp'],
    commands: [
      { func: 'run-revoked-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
    ]
  },
  {
    name: 'test-ocsp-valid-cert-server-does-not-staple',
    tags: ['ocsp'],
    commands: [
      { func: 'run-valid-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
    ]
  },
  {
    name: 'test-ocsp-invalid-cert-server-does-not-staple',
    tags: ['ocsp'],
    commands: [
      { func: 'run-revoked-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
    ]
  },
  {
    name: 'test-ocsp-soft-fail',
    tags: ['ocsp'],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
    ]
  },
  {
    name: 'test-ocsp-malicious-invalid-cert-mustStaple-server-does-not-staple',
    tags: ['ocsp'],
    commands: [
      { func: 'run-revoked-ocsp-server' },
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
    ]
  },
  {
    name: 'test-ocsp-malicious-no-responder-mustStaple-server-does-not-staple',
    tags: ['ocsp'],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple-disableStapling.json',
          VERSION: 'latest',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
    ]
  }
]);

TLS_VERSIONS.forEach(VERSION => {
  TASKS.push({
    name: `test-tls-support-${VERSION}`,
    tags: ['tls-support'],
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION,
          SSL: 'ssl',
          TOPOLOGY: 'server'
        }
      },
      { func: 'run tls tests' }
    ]
  });
});

OCSP_VERSIONS.forEach(VERSION => {
  // manually added tasks
  Array.prototype.push.apply(TASKS, [
    {
      name: `test-${VERSION}-ocsp-valid-cert-server-staples`,
      tags: ['ocsp'],
      commands: [
        { func: `run-valid-ocsp-server` },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-invalid-cert-server-staples`,
      tags: ['ocsp'],
      commands: [
        { func: 'run-revoked-ocsp-server' },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-valid-cert-server-does-not-staple`,
      tags: ['ocsp'],
      commands: [
        { func: 'run-valid-ocsp-server' },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-invalid-cert-server-does-not-staple`,
      tags: ['ocsp'],
      commands: [
        { func: 'run-revoked-ocsp-server' },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-soft-fail`,
      tags: ['ocsp'],
      commands: [
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 1 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-malicious-invalid-cert-mustStaple-server-does-not-staple`,
      tags: ['ocsp'],
      commands: [
        { func: 'run-revoked-ocsp-server' },
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
      ]
    },
    {
      name: `test-${VERSION}-ocsp-malicious-no-responder-mustStaple-server-does-not-staple`,
      tags: ['ocsp'],
      commands: [
        { func: 'install dependencies' },
        {
          func: 'bootstrap mongo-orchestration',
          vars: {
            ORCHESTRATION_FILE: 'rsa-basic-tls-ocsp-mustStaple-disableStapling.json',
            VERSION: VERSION,
            TOPOLOGY: 'server'
          }
        },
        { func: 'run-ocsp-test', vars: { OCSP_TLS_SHOULD_SUCCEED: 0 } }
      ]
    }
  ]);
});

const AWS_AUTH_TASKS = [];

AWS_AUTH_VERSIONS.forEach(VERSION => {
  const name = `aws-${VERSION}-auth-test`;
  AWS_AUTH_TASKS.push(name);
  TASKS.push({
    name: name,
    commands: [
      { func: 'install dependencies' },
      {
        func: 'bootstrap mongo-orchestration',
        vars: {
          VERSION: VERSION,
          AUTH: 'auth',
          ORCHESTRATION_FILE: 'auth-aws.json',
          TOPOLOGY: 'server'
        }
      },
      { func: 'add aws auth variables to file' },
      { func: 'run aws auth test with regular aws credentials' },
      { func: 'run aws auth test with assume role credentials' },
      { func: 'run aws auth test with aws EC2 credentials' },
      // FIXME: NODE-3113
      // { func: 'run aws auth test with aws credentials as environment variables' },
      // { func: 'run aws auth test with aws credentials and session token as environment variables' },
      // { func: 'run aws ECS auth test' }
    ]
  });
});

const BUILD_VARIANTS = [];

const getTaskList = (() => {
  const memo = {};
  return function (mongoVersion, os) {
    const key = mongoVersion + os;

    if (memo[key]) {
      return memo[key];
    }
    const taskList = BASE_TASKS.concat(TASKS);
    const ret = taskList
      .filter(task => {
        if (task.name.match(/^aws/)) return false;

        // skip unsupported tasks on windows
        if (
          os.match(/^windows/) &&
          task.tags &&
          task.tags.filter(tag => WINDOWS_SKIP_TAGS.has(tag)).length
        ) {
          return false;
        }

        const tasksWithVars = task.commands.filter(task => !!task.vars);
        if (!tasksWithVars.length) {
          return true;
        }

        const { VERSION } = task.commands.filter(task => !!task.vars)[0].vars;
        if (VERSION === 'latest') {
          return semver.satisfies(semver.coerce(LATEST_EFFECTIVE_VERSION), mongoVersion);
        }

        return semver.satisfies(semver.coerce(VERSION), mongoVersion);
      })
      .map(x => x.name);

    memo[key] = ret;
    return ret;
  };
})();

OPERATING_SYSTEMS.forEach(
  ({
    name: osName,
    display_name: osDisplayName,
    run_on,
    mongoVersion = '>=2.6',
    nodeVersions = NODE_VERSIONS,
    clientEncryption,
    msvsVersion
  }) => {
    const testedNodeVersions = NODE_VERSIONS.filter(version => nodeVersions.includes(version));
    const tasks = getTaskList(mongoVersion, osName.split('-')[0]);

    testedNodeVersions.forEach(NODE_LTS_NAME => {
      const nodeLtsDisplayName = `Node ${NODE_LTS_NAME[0].toUpperCase()}${NODE_LTS_NAME.substr(1)}`;
      const name = `${osName}-${NODE_LTS_NAME}`;
      const display_name = `${osDisplayName} ${nodeLtsDisplayName}`;
      const expansions = { NODE_LTS_NAME };

      if (clientEncryption) {
        expansions.CLIENT_ENCRYPTION = true;
      }
      if (msvsVersion) {
        expansions.MSVS_VERSION = msvsVersion;
      }

      BUILD_VARIANTS.push({ name, display_name, run_on, expansions, tasks });
    });
  }
);

// singleton build variant for linting
SINGLETON_TASKS.push({
  name: 'run-checks',
  tags: ['run-checks'],
  commands: [
    {
      func: 'install dependencies',
      vars: {
        NODE_LTS_NAME: 'erbium'
      }
    },
    { func: 'run checks' }
  ]
});

BUILD_VARIANTS.push({
  name: 'lint',
  display_name: 'lint',
  run_on: 'rhel70',
  tasks: ['run-checks']
}, {
  name: 'ubuntu1804-custom-csfle-tests',
  display_name: 'Custom FLE Version Test',
  run_on: 'ubuntu1804-test',
  tasks: ['run-custom-csfle-tests']
});

// singleton build variant for mongosh integration tests
SINGLETON_TASKS.push({
  name: 'run-mongosh-integration-tests',
  tags: ['run-mongosh-integration-tests'],
  exec_timeout_secs: 3600,
  commands: [
    {
      func: 'install dependencies',
      vars: {
        NODE_LTS_NAME: 'fermium'
      }
    },
    { func: 'run mongosh integration tests' }
  ]
});

BUILD_VARIANTS.push({
  name: 'mongosh_integration_tests',
  display_name: 'mongosh integration tests',
  run_on: 'ubuntu1804-test',
  tasks: ['run-mongosh-integration-tests']
});

// special case for MONGODB-AWS authentication
BUILD_VARIANTS.push({
  name: 'ubuntu1804-test-mongodb-aws',
  display_name: 'MONGODB-AWS Auth test',
  run_on: 'ubuntu1804-test',
  expansions: {
    NODE_LTS_NAME: 'dubnium'
  },
  tasks: AWS_AUTH_TASKS
});

// special case for custom CSFLE test
SINGLETON_TASKS.push({
  name: 'run-custom-csfle-tests',
  tags: ['run-custom-csfle-tests'],
  commands: [
    {
      func: 'install dependencies',
      vars: {
        NODE_LTS_NAME: 'erbium',
      },
    },
    {
      func: 'bootstrap mongo-orchestration',
      vars: {
        VERSION: '4.4',
        TOPOLOGY: 'server'
      }
    },
    { func: 'run custom csfle tests' }
  ]
});

const fileData = yaml.safeLoad(fs.readFileSync(`${__dirname}/config.yml.in`, 'utf8'));
fileData.tasks = (fileData.tasks || []).concat(BASE_TASKS).concat(TASKS).concat(SINGLETON_TASKS);
fileData.buildvariants = (fileData.buildvariants || []).concat(BUILD_VARIANTS);

fs.writeFileSync(`${__dirname}/config.yml`, yaml.safeDump(fileData, { lineWidth: 120 }), 'utf8');
