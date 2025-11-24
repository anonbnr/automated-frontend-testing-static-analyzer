SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

-- =====================================================================
--  PROJECTS
-- =====================================================================

CREATE TABLE projects (
    id              UUID            NOT NULL PRIMARY KEY,
    name            VARCHAR(128)    NOT NULL,
    projectRoot     VARCHAR(1024)   NOT NULL,
    description     TEXT,
    url             VARCHAR(1024),
    scannedAt       DATETIME        DEFAULT NULL,
    inserted_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- =====================================================================
--  MODULES
-- =====================================================================

CREATE TABLE modules (
    name            VARCHAR(128)    NOT NULL,
    projectId       UUID            NOT NULL,
    filePath        VARCHAR(1024)   NOT NULL,
    imports         JSON            NOT NULL,
    declarations    JSON            NOT NULL,
    exports         JSON            NOT NULL,
    lazy            BOOLEAN         NOT NULL,
    role            VARCHAR(32)     NOT NULL,
    inserted_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (name, projectId),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  COMPONENTS
-- =====================================================================

CREATE TABLE components (
    selector        VARCHAR(128)    NOT NULL,
    projectId       UUID            NOT NULL,
    name            VARCHAR(128)    NOT NULL,
    nestedComponents JSON           NOT NULL,
    inserted_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (selector, projectId),
    INDEX idx_component_name (name),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  COMPONENT_ROUTES
-- =====================================================================

CREATE TABLE component_routes (
    route               VARCHAR(512)   NOT NULL,
    projectId           UUID           NOT NULL,
    module              VARCHAR(128)   DEFAULT NULL,
    component           VARCHAR(128)   NOT NULL,
    loadChildren        VARCHAR(3000),
    loadComponent       VARCHAR(3000),
    pathMatch           VARCHAR(32),
    canActivate         JSON,
    canActivateChild    JSON,
    canLoad             JSON,
    resolve             JSON,
    data                JSON,
    inserted_at         DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (route, projectId),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (module) REFERENCES modules(name) ON DELETE SET NULL,
    FOREIGN KEY (component) REFERENCES components(name) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  REDIRECT_ROUTES
-- =====================================================================

CREATE TABLE redirect_routes (
    route           VARCHAR(512)    NOT NULL,
    projectId       UUID            NOT NULL,
    module          VARCHAR(128)    DEFAULT NULL,
    redirectTo      VARCHAR(512)    NOT NULL,
    pathMatch       VARCHAR(32),
    inserted_at     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (route, projectId),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (module) REFERENCES modules(name) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================================
--  ROUTE_ROLES
-- =====================================================================

CREATE TABLE route_roles (
    projectId       UUID    NOT NULL,
    root            JSON    NOT NULL,
    global          JSON    NOT NULL,
    shared          JSON    NOT NULL,
    mapped          JSON    NOT NULL,
    dead            JSON    NOT NULL,
    inserted_at     DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (projectId),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  WIDGETS
-- =====================================================================

CREATE TABLE widgets (
    id                      VARCHAR(512)    NOT NULL,
    componentSelector        VARCHAR(128)   NOT NULL,
    parentId                 VARCHAR(512),
    projectId                UUID           NOT NULL,
    type                    VARCHAR(128)    NOT NULL,
    events                  JSON,
    attributes              JSON,
    validationRules         JSON,
    triggersFormSubmission  BOOLEAN         NOT NULL,
    inserted_at             DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id, projectId),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (componentSelector) REFERENCES components(selector) ON DELETE CASCADE,
    FOREIGN KEY (parentId) REFERENCES widgets(id) ON DELETE SET NULL
) ENGINE=InnoDB;

-- =====================================================================
--  GRAPHS
-- =====================================================================

CREATE TABLE graphs (
    graphId         INT AUTO_INCREMENT PRIMARY KEY,
    projectId       UUID           NOT NULL,
    nodes           JSON           NOT NULL,
    edges           JSON           NOT NULL,
    transitions     JSON           NOT NULL,
    inserted_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  USERJOURNEYS
-- =====================================================================

CREATE TABLE userjourneys (
    id               VARCHAR(512)   NOT NULL,
    projectId        UUID           NOT NULL,
    rootModule       VARCHAR(128)   NOT NULL,
    steps            JSON           NOT NULL,
    expandedSteps    JSON           NOT NULL,
    name             VARCHAR(128),
    projectRoot      VARCHAR(1024),
    path             JSON,
    intent           VARCHAR(128),
    success          BOOLEAN,
    inserted_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id, projectId),
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  SCENARIOS
-- =====================================================================

CREATE TABLE scenarios (
    id                      INT AUTO_INCREMENT PRIMARY KEY,
    userJourneyId           VARCHAR(512)   NOT NULL,
    projectId               UUID           NOT NULL,
    name                    VARCHAR(128)   NOT NULL,
    description             TEXT,
    editedBy                VARCHAR(32)    NOT NULL,
    tags                    JSON,
    status                  VARCHAR(32),
    coverage                JSON,
    stepsData               JSON,
    inserted_at             DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (userJourneyId) REFERENCES userjourneys(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  WORKFLOWS
-- =====================================================================

CREATE TABLE workflows (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    projectId       UUID           NOT NULL,
    name            VARCHAR(128)   NOT NULL,
    description     TEXT,
    inserted_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- =====================================================================
--  WORKFLOWS_SCENARIOS
-- =====================================================================

CREATE TABLE workflows_scenarios (
    workflowId      INT            NOT NULL,
    scenarioId      INT            NOT NULL,
    `order`         SMALLINT       NOT NULL,
    inserted_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (workflowId, scenarioId),
    UNIQUE (workflowId, `order`),
    FOREIGN KEY (workflowId) REFERENCES workflows(id) ON DELETE CASCADE,
    FOREIGN KEY (scenarioId) REFERENCES scenarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
