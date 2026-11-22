package RocketChicken_fla
{
   import adobe.utils.*;
   import flash.accessibility.*;
   import flash.desktop.*;
   import flash.display.*;
   import flash.errors.*;
   import flash.events.*;
   import flash.external.*;
   import flash.filters.*;
   import flash.geom.*;
   import flash.globalization.*;
   import flash.media.*;
   import flash.net.*;
   import flash.net.drm.*;
   import flash.printing.*;
   import flash.profiler.*;
   import flash.sampler.*;
   import flash.sensors.*;
   import flash.system.*;
   import flash.text.*;
   import flash.text.engine.*;
   import flash.text.ime.*;
   import flash.ui.*;
   import flash.utils.*;
   import flash.xml.*;
   
   [Embed(source="/_assets/assets.swf", symbol="symbol925")]
   public dynamic class belts_btn_134 extends MovieClip
   {
      
      public var ov:MovieClip;
      
      public var newy:MovieClip;
      
      public function belts_btn_134()
      {
         super();
         addFrameScript(0,this.frame1);
      }
      
      internal function frame1() : *
      {
         if(!globalVars.newBelt)
         {
            this.newy.visible = false;
            this.newy.stop();
         }
         else
         {
            this.newy.visible = true;
            this.newy.play();
            this.newy.newc.visible = true;
         }
      }
   }
}

