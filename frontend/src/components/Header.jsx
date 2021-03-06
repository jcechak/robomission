import React from 'react';
import AppBar from 'material-ui/AppBar';
import { Toolbar, ToolbarGroup } from 'material-ui/Toolbar';
import muiThemeable from 'material-ui/styles/muiThemeable';
import logo from '../images/logo.png'
import LevelBar from '../components/LevelBar';



class Header extends React.Component {
  render() {
    const logoImg = (
      <img
        alt='RoboMission logo'
        src={ logo }
        style={{
          height: '100%',
          padding: 14,
          boxSizing: 'border-box',
        }}
      />
    );
    const toolbar = (
      <Toolbar style={{ backgroundColor: 'transparent', color: 'white' }}>
        <ToolbarGroup>
          <LevelBar mini {...this.props.levelInfo} />
        </ToolbarGroup>
      </Toolbar>
    );
    return (
      <AppBar
        title={logoImg}
        style={{
          backgroundColor: this.props.muiTheme.palette.primary1Color,
          margin: 0,
        }}
        onLeftIconButtonTouchTap={this.props.onMenuIconTouchTap}
        iconElementRight={toolbar}
      />
    );
  }
}

Header = muiThemeable()(Header);

export default Header;
